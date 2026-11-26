const { Resend } = require('resend');
const nodemailer = require('nodemailer');
const limits = require('../config/security');

// ============================================================================
// EMAIL PROVIDER SWITCH
// ============================================================================
// Set EMAIL_PROVIDER in .env to control which service is active:
//   EMAIL_PROVIDER=nodemailer   → Gmail / custom SMTP via Nodemailer (DEFAULT)
//   EMAIL_PROVIDER=resend       → Resend HTTPS API (Port 443)
//   EMAIL_PROVIDER=brevo        → Brevo HTTPS API (Port 443)
//   EMAIL_PROVIDER=auto         → Nodemailer first, HTTPS API fallback if blocked
// ============================================================================
const VALID_PROVIDERS = ['nodemailer', 'resend', 'brevo', 'auto'];
const CONSUMER_EMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com']);

function cleanEnv(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed.replace(/^(['"])(.*)\1$/, '$2').trim();
}

function getEmailProvider() {
  const provider = (cleanEnv(process.env.EMAIL_PROVIDER) || 'nodemailer').toLowerCase();
  if (!VALID_PROVIDERS.includes(provider)) {
    throw new Error(`EMAIL_PROVIDER must be one of: ${VALID_PROVIDERS.join(', ')}`);
  }
  return provider;
}

// Fail fast at startup if an invalid EMAIL_PROVIDER is configured
getEmailProvider();

// ============================================================================
// NODEMAILER (SMTP) — RESILIENT TRANSPORT WITH IPv4 + PORT 465 FALLBACK
// ============================================================================
let cachedTransport = null;
let cachedTransportKey = '';

function resetNodemailerTransport() {
  if (cachedTransport && typeof cachedTransport.close === 'function') {
    try {
      cachedTransport.close();
    } catch (_) { /* ignore close error */ }
  }
  cachedTransport = null;
  cachedTransportKey = '';
}

function smtpConfig(portOverride = null) {
  const user = cleanEnv(process.env.SMTP_USER);
  const rawPass = cleanEnv(process.env.SMTP_PASS);
  const host = cleanEnv(process.env.SMTP_HOST) || 'smtp.gmail.com';
  const configuredPort = Number(cleanEnv(process.env.SMTP_PORT)) || 587;
  const port = portOverride || configuredPort;
  const lowerHost = host.toLowerCase();
  const isGmail = lowerHost === 'smtp.gmail.com' || lowerHost === 'smtp.googlemail.com' || lowerHost === 'gmail';
  // Google displays 16-char App Passwords in groups of 4 with spaces; strip spaces for Gmail SMTP auth.
  const pass = isGmail ? rawPass.replace(/\s/g, '') : rawPass;
  const connectTimeout = Math.min(limits.workTimeout, Number(cleanEnv(process.env.SMTP_CONNECT_TIMEOUT_MS)) || 10000);
  const usePool = cleanEnv(process.env.SMTP_POOL).toLowerCase() === 'true';

  return { user, pass, host, port, configuredPort, isGmail, connectTimeout, usePool };
}

function getNodemailerTransport(portOverride = null) {
  const cfg = smtpConfig(portOverride);
  if (!cfg.user || !cfg.pass) {
    console.warn('[EMAIL] SMTP_USER or SMTP_PASS not configured — Nodemailer emails will fail');
    return { transport: null, cfg };
  }

  const key = `${cfg.host}:${cfg.port}:${cfg.user}:${cfg.pass}:${cfg.usePool}`;
  if (!cachedTransport || cachedTransportKey !== key) {
    resetNodemailerTransport();
    cachedTransport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465, // true for SMTPS (465), false for STARTTLS (587)
      auth: { user: cfg.user, pass: cfg.pass },
      requireTLS: cfg.port === 587,
      family: 4, // Avoid IPv6 blackholes in cloud containers
      dnsTimeout: cfg.connectTimeout,
      connectionTimeout: cfg.connectTimeout,
      greetingTimeout: cfg.connectTimeout,
      socketTimeout: limits.workTimeout,
      ...(cfg.usePool ? { pool: true, maxConnections: 2, maxMessages: 50 } : { pool: false })
    });
    cachedTransportKey = key;
  }

  return { transport: cachedTransport, cfg };
}

function isTransientNetworkError(error) {
  const code = String(error?.code || '').toUpperCase();
  const msg = String(error?.message || '');
  if (['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH', 'EAI_AGAIN', 'EDNS', 'ETLS', 'EPIPE'].includes(code)) {
    return true;
  }
  return /timeout|timed out|socket close|connection closed|greeting never received|ehostunreach|enetunreach|econnrefused|econnreset|tls/i.test(msg);
}

function isAuthError(error) {
  const code = String(error?.code || '').toUpperCase();
  const responseCode = Number(error?.responseCode);
  return code === 'EAUTH' || responseCode === 535 || /username and password not accepted|invalid login|authentication failed/i.test(String(error?.message || ''));
}

function toAttachmentBuffer(content) {
  if (Buffer.isBuffer(content)) return content;
  if (content instanceof Uint8Array) return Buffer.from(content);
  if (typeof content === 'string') return Buffer.from(content, 'base64');
  return content;
}

function resolveSmtpSender(user) {
  const explicit = cleanEnv(process.env.SMTP_SENDER_EMAIL);
  if (explicit) return explicit;
  const shared = cleanEnv(process.env.SENDER_EMAIL);
  if (shared && !shared.toLowerCase().includes('resend.dev')) return shared;
  return user;
}

function formatSmtpError(error, cfg) {
  if (isAuthError(error)) {
    return 'SMTP authentication failed (535/EAUTH). Verify SMTP_USER and use a valid 16-character Google App Password in SMTP_PASS.';
  }
  if (isTransientNetworkError(error)) {
    const code = error?.code || 'NETWORK_ERR';
    return `SMTP connection to ${cfg.host}:${cfg.port} failed (${code}: ${error.message || 'timeout'}). Cloud hosts such as Render Free Tier block outbound SMTP ports 25/465/587 — use an HTTPS email provider (BREVO_API_KEY or EMAIL_PROVIDER=resend with a verified domain) or enable outbound SMTP on your host.`;
  }
  return error?.message || String(error);
}

async function sendWithNodemailer({ to, subject, html, text, attachments = [] }) {
  const initial = getNodemailerTransport();
  if (!initial.transport) {
    return { delivered: false, error: 'SMTP is not configured (SMTP_USER / SMTP_PASS missing)' };
  }

  const recipients = Array.isArray(to) ? to : [to];
  const sender = resolveSmtpSender(initial.cfg.user);
  const mailOptions = {
    from: sender,
    to: recipients.join(', '),
    subject,
    html,
    text,
    attachments: attachments.map(item => ({
      filename: item.filename,
      content: toAttachmentBuffer(item.content)
    }))
  };

  let activeCfg = initial.cfg;
  let info;
  try {
    info = await initial.transport.sendMail(mailOptions);
  } catch (primaryErr) {
    if (!isTransientNetworkError(primaryErr)) {
      const formatted = formatSmtpError(primaryErr, activeCfg);
      const err = new Error(formatted);
      err.code = primaryErr?.code;
      err.responseCode = primaryErr?.responseCode;
      err.isNetworkFailure = false;
      throw err;
    }

    // Clear potentially broken/stale pooled transport before retrying
    resetNodemailerTransport();

    const canRetryOn465 = activeCfg.port === 587 && cleanEnv(process.env.SMTP_DISABLE_465_FALLBACK).toLowerCase() !== 'true';
    if (!canRetryOn465 && !activeCfg.usePool) {
      const formatted = formatSmtpError(primaryErr, activeCfg);
      const err = new Error(formatted);
      err.code = primaryErr?.code;
      err.responseCode = primaryErr?.responseCode;
      err.isNetworkFailure = true;
      throw err;
    }

    const retryPort = canRetryOn465 ? 465 : activeCfg.port;
    console.warn(`[EMAIL:NODEMAILER] Port ${activeCfg.port} failed (${primaryErr.code || primaryErr.message}); retrying via port ${retryPort}...`);

    try {
      const retry = getNodemailerTransport(retryPort);
      activeCfg = retry.cfg;
      info = await retry.transport.sendMail(mailOptions);
    } catch (retryErr) {
      resetNodemailerTransport();
      const formatted = formatSmtpError(retryErr, activeCfg);
      const err = new Error(formatted);
      err.code = retryErr?.code || primaryErr?.code;
      err.responseCode = retryErr?.responseCode;
      err.isNetworkFailure = isTransientNetworkError(retryErr);
      throw err;
    }
  }

  const accepted = Array.isArray(info?.accepted) ? info.accepted : [];
  const rejected = Array.isArray(info?.rejected) ? info.rejected : [];
  const delivered = accepted.length > 0 && rejected.length === 0;
  return {
    delivered,
    ...(delivered ? {} : { error: 'SMTP did not accept all recipients' }),
    dev_mode: false,
    email_id: info?.messageId,
    intended_recipients: recipients,
    actual_recipients: accepted,
    redirected: false
  };
}

// ============================================================================
// BREVO HTTPS API (Port 443 — works on Render Free Tier with Gmail sender)
// ============================================================================
function parseEmailAddress(address) {
  const raw = cleanEnv(address);
  const match = raw.match(/^(?:"?([^"]*)"?\s)?<([^<>@\s]+@[^<>@\s]+)>$/);
  if (match) {
    return { ...(match[1]?.trim() ? { name: match[1].trim() } : {}), email: match[2].trim() };
  }
  return { email: raw };
}

async function sendWithBrevo({ to, subject, html, text, attachments = [] }) {
  const apiKey = cleanEnv(process.env.BREVO_API_KEY);
  if (!apiKey) return { delivered: false, error: 'BREVO_API_KEY is not configured' };

  const senderRaw = cleanEnv(process.env.BREVO_SENDER_EMAIL) || cleanEnv(process.env.SENDER_EMAIL) || cleanEnv(process.env.SMTP_USER);
  if (!senderRaw) throw new Error('SENDER_EMAIL or BREVO_SENDER_EMAIL is required for Brevo');

  const intendedRecipients = Array.isArray(to) ? to : [to];
  const payload = {
    sender: parseEmailAddress(senderRaw),
    to: intendedRecipients.map(email => parseEmailAddress(email)),
    subject,
    ...(html ? { htmlContent: html } : {}),
    ...(text ? { textContent: text } : {}),
    ...(attachments.length ? {
      attachment: attachments.map(item => {
        const raw = item.content;
        const encoded = Buffer.isBuffer(raw) ? raw.toString('base64')
          : raw instanceof Uint8Array ? Buffer.from(raw).toString('base64')
          : String(raw || '');
        return { name: item.filename, content: encoded };
      })
    } : {})
  };

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'api-key': apiKey
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(limits.workTimeout)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `Brevo API rejected request (${response.status})`);
  }

  return {
    delivered: true,
    dev_mode: false,
    email_id: data.messageId || null,
    intended_recipients: intendedRecipients,
    actual_recipients: intendedRecipients,
    redirected: false,
    provider: 'brevo'
  };
}

// ============================================================================
// RESEND HTTPS API (Port 443)
// ============================================================================
let resendClient = null;
let cachedResendKey = '';
let nextSendAt = 0;
let sendChain = Promise.resolve();
let queuedSends = 0;

const APP_URL = () => cleanEnv(process.env.FRONTEND_URL) || cleanEnv(process.env.APP_URL);

function extractEmailDomain(address) {
  const email = parseEmailAddress(address).email;
  const parts = email.split('@');
  return parts.length === 2 ? parts[1].toLowerCase() : '';
}

function canUseResendAsFallback() {
  if (!cleanEnv(process.env.RESEND_API_KEY)) return false;
  if (cleanEnv(process.env.RESEND_SENDER_EMAIL)) return true;
  if (cleanEnv(process.env.RESEND_TEST_MODE) === 'true') return true;
  const sender = cleanEnv(process.env.SENDER_EMAIL);
  if (!sender) return false;
  return !CONSUMER_EMAIL_DOMAINS.has(extractEmailDomain(sender));
}

const HAS_KEY = () => {
  const provider = getEmailProvider();
  const hasSmtp = Boolean(cleanEnv(process.env.SMTP_USER) && cleanEnv(process.env.SMTP_PASS));
  const hasBrevo = Boolean(cleanEnv(process.env.BREVO_API_KEY));
  const hasResend = Boolean(cleanEnv(process.env.RESEND_API_KEY));

  if (provider === 'nodemailer') return hasSmtp || hasBrevo || canUseResendAsFallback();
  if (provider === 'resend') return hasResend;
  if (provider === 'brevo') return hasBrevo;
  return hasSmtp || hasBrevo || hasResend;
};

function deliveryConfig() {
  const sender = cleanEnv(process.env.RESEND_SENDER_EMAIL) || cleanEnv(process.env.SENDER_EMAIL);
  const testMode = cleanEnv(process.env.RESEND_TEST_MODE) === 'true';
  const testRecipient = cleanEnv(process.env.RESEND_TEST_RECIPIENT);
  if (!sender) throw new Error('SENDER_EMAIL is not configured');
  if (testMode && !testRecipient) throw new Error('RESEND_TEST_RECIPIENT is not configured');
  return { sender, testMode, testRecipient };
}

function resendClientInstance() {
  const key = cleanEnv(process.env.RESEND_API_KEY);
  if (!resendClient || cachedResendKey !== key) {
    resendClient = new Resend(key);
    cachedResendKey = key;
  }
  return resendClient;
}

function scheduleSend(task) {
  if (queuedSends >= limits.queueLimit) return Promise.reject(new Error('Email capacity reached'));
  queuedSends++;
  const queued = sendChain.then(async () => {
    const wait = Math.max(0, nextSendAt - Date.now());
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    nextSendAt = Date.now() + 550;
    return task();
  });
  sendChain = queued.catch(() => {});
  return queued.finally(() => { queuedSends--; });
}

async function sendWithResend({ to, subject, html, text, attachments = [], idempotencyKey }) {
  if (!cleanEnv(process.env.RESEND_API_KEY)) return { delivered: false, error: 'RESEND_API_KEY is not configured' };

  const { sender, testMode, testRecipient } = deliveryConfig();
  const intendedRecipients = Array.isArray(to) ? to : [to];
  const actualRecipients = testMode ? [testRecipient] : intendedRecipients;
  const encodedAttachments = attachments.map(item => ({
    filename: item.filename,
    content: Buffer.isBuffer(item.content) ? item.content.toString('base64') : item.content
  }));
  const totalBytes = attachments.reduce((sum, item) => sum + (Buffer.isBuffer(item.content) ? item.content.length : 0), 0);
  if (totalBytes > 30 * 1024 * 1024) throw new Error('Email attachments exceed the 30 MB application limit');

  const result = await scheduleSend(() => require('../services/workload').withSlot('email', () => resendClientInstance().emails.send({
    from: sender,
    to: actualRecipients,
    subject,
    html,
    text,
    attachments: encodedAttachments
  }, { idempotencyKey, signal: AbortSignal.timeout(limits.workTimeout) })));
  if (result.error) throw new Error(result.error.message || 'Resend rejected the email');
  return {
    delivered: true,
    dev_mode: false,
    email_id: result.data?.id,
    intended_recipients: intendedRecipients,
    actual_recipients: actualRecipients,
    redirected: testMode,
    provider: 'resend'
  };
}

// ============================================================================
// UNIFIED sendEmail — routes to active provider with HTTPS fallback on network block
// ============================================================================
async function sendEmail({ to, subject, html, text, attachments = [], idempotencyKey }) {
  const intendedRecipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!intendedRecipients.length) return { delivered: false, error: 'No recipient email address' };
  if (!HAS_KEY()) return { delivered: false, error: 'Email service is unavailable' };

  const provider = getEmailProvider();
  const payload = { to: intendedRecipients, subject, html, text, attachments, idempotencyKey };

  try {
    if (provider === 'resend') {
      return await sendWithResend(payload);
    }
    if (provider === 'brevo') {
      return await sendWithBrevo(payload);
    }

    // 'nodemailer' or 'auto'
    const hasSmtp = Boolean(cleanEnv(process.env.SMTP_USER) && cleanEnv(process.env.SMTP_PASS));
    if (hasSmtp) {
      try {
        return await sendWithNodemailer(payload);
      } catch (smtpError) {
        const shouldFallback = smtpError.isNetworkFailure || provider === 'auto';
        if (shouldFallback && cleanEnv(process.env.BREVO_API_KEY)) {
          console.warn(`[EMAIL] Nodemailer failed (${smtpError.code || smtpError.message}); falling back to Brevo HTTPS API...`);
          return await sendWithBrevo(payload);
        }
        if (shouldFallback && canUseResendAsFallback()) {
          console.warn(`[EMAIL] Nodemailer failed (${smtpError.code || smtpError.message}); falling back to Resend HTTPS API...`);
          return await sendWithResend(payload);
        }
        throw smtpError;
      }
    }

    if (cleanEnv(process.env.BREVO_API_KEY)) return await sendWithBrevo(payload);
    if (canUseResendAsFallback()) return await sendWithResend(payload);
    return { delivered: false, error: 'SMTP is not configured (SMTP_USER / SMTP_PASS missing)' };
  } catch (error) {
    console.error(`[EMAIL:${provider.toUpperCase()}:ERR]`, error.message || error);
    return { delivered: false, dev_mode: false, error: error.message || String(error) };
  }
}

/**
 * Non-blocking startup verification helper (never throws).
 * Call explicitly from server.js so unit tests that mock nodemailer are unaffected.
 */
async function verifyEmailTransport() {
  const provider = getEmailProvider();
  if (!['nodemailer', 'auto'].includes(provider)) {
    console.log(`[EMAIL] Active provider: ${provider.toUpperCase()} (HTTPS API)`);
    return { ok: true, provider };
  }

  const { transport, cfg } = getNodemailerTransport();
  if (!transport) {
    console.warn('[EMAIL] Nodemailer SMTP credentials not configured');
    return { ok: false, provider: 'nodemailer', error: 'SMTP_USER / SMTP_PASS missing' };
  }

  try {
    await transport.verify();
    console.log(`[EMAIL] Nodemailer SMTP ready (${cfg.host}:${cfg.port})`);
    return { ok: true, provider: 'nodemailer', port: cfg.port };
  } catch (err) {
    if (cfg.port === 587 && isTransientNetworkError(err)) {
      resetNodemailerTransport();
      const { transport: t465 } = getNodemailerTransport(465);
      try {
        await t465.verify();
        console.log(`[EMAIL] Nodemailer SMTP ready via fallback port 465 (${cfg.host}:465)`);
        return { ok: true, provider: 'nodemailer', port: 465 };
      } catch (err465) {
        resetNodemailerTransport();
        const msg = formatSmtpError(err465, { ...cfg, port: 465 });
        console.warn(`[EMAIL] Nodemailer SMTP check failed: ${msg}`);
        return { ok: false, provider: 'nodemailer', error: msg };
      }
    }
    const msg = formatSmtpError(err, cfg);
    console.warn(`[EMAIL] Nodemailer SMTP check failed: ${msg}`);
    return { ok: false, provider: 'nodemailer', error: msg };
  }
}

// ============================================================================
// HIGH-LEVEL EMAIL FUNCTIONS
// ============================================================================
async function sendVerificationEmail(user, code) {
  return sendEmail({
    to: user.email,
    subject: 'Verify your CampusCert email',
    html: `<div style="font-family:Arial,sans-serif"><h2>Welcome, ${escapeHtml(user.name)}</h2><p>Your verification code is:</p><h1 style="letter-spacing: 4px; color: #4f46e5;">${code}</h1><p>Enter this code to activate your account.</p></div>`,
    text: `Your verification code is: ${code}`,
    idempotencyKey: `email-verification/${user.id}/${code}`
  });
}

async function sendPasswordResetEmail(user, token) {
  const url = new URL('/auth/reset-password', APP_URL());
  url.searchParams.set('token', token);
  const link = url.href;
  return sendEmail({
    to: user.email,
    subject: 'Reset your CampusCert password',
    html: `<div style="font-family:Arial,sans-serif"><h2>Password reset</h2><p>This link expires in one hour.</p><p><a href="${link}">Reset password</a></p></div>`,
    text: `Reset your password: ${link}`,
    idempotencyKey: `password-reset/${user.id}/${token.slice(0, 12)}`
  });
}

async function sendInviteEmail(email, inviterName, organizationName, role, tempPassword = null) {
  const loginLink = `${APP_URL()}`;
  let html = `<div style="font-family:Arial,sans-serif">
    <h2>You have been invited to join ${escapeHtml(organizationName)}</h2>
    <p><b>${escapeHtml(inviterName)}</b> has invited you to collaborate as a <b>${escapeHtml(role)}</b>.</p>`;

  let text = `You have been invited to join ${organizationName} by ${inviterName} as a ${role}.`;

  if (tempPassword) {
    html += `<p>Your account has been created securely. You can log in using your email and the following temporary password:</p>
             <div style="background-color: #f1f5f9; padding: 12px; border-radius: 8px; font-family: monospace; font-size: 18px; letter-spacing: 2px; color: #0f172a; margin: 16px 0;">
               ${escapeHtml(tempPassword)}
             </div>
             <p>Please change this password after you log in.</p>`;
    text += `\n\nYour temporary password is: ${tempPassword}\nPlease log in and change your password.`;
  } else {
    html += `<p>You can use your existing CampusCert Pro account to log in.</p>`;
    text += `\n\nYou can use your existing CampusCert Pro account to log in.`;
  }

  html += `<p><a href="${loginLink}" style="display:inline-block;background-color:#4f46e5;color:#ffffff;padding:10px 20px;text-decoration:none;border-radius:6px;margin-top:12px;">Log in to CampusCert Pro</a></p></div>`;
  text += `\n\nLog in here: ${loginLink}`;

  return sendEmail({
    to: email,
    subject: `Invitation to join ${organizationName}`,
    html,
    text,
    idempotencyKey: `invite/${email}/${Date.now()}`
  });
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendInviteEmail,
  verifyEmailTransport,
  resetNodemailerTransport,
  HAS_KEY,
  escapeHtml
};
