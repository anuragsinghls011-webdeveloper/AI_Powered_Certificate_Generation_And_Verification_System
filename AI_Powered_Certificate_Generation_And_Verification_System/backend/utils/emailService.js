const { Resend } = require('resend');
const nodemailer = require('nodemailer');
const limits = require('../config/security');

// ============================================================================
// EMAIL PROVIDER SWITCH
// ============================================================================
// Set EMAIL_PROVIDER in .env to control which service is active:
//   EMAIL_PROVIDER=nodemailer   → uses Gmail SMTP via Nodemailer (DEFAULT)
//   EMAIL_PROVIDER=resend       → uses Resend API
// ============================================================================
const EMAIL_PROVIDER = (process.env.EMAIL_PROVIDER || 'nodemailer').toLowerCase();

// ============================================================================
// NODEMAILER (Gmail SMTP) — ACTIVE BY DEFAULT
// ============================================================================
let nodemailerTransport = null;

function getNodemailerTransport() {
  if (!nodemailerTransport) {
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = Number(process.env.SMTP_PORT) || 587;

    if (!user || !pass) {
      console.warn('[EMAIL] SMTP_USER or SMTP_PASS not configured — Nodemailer emails will fail');
      return null;
    }

    nodemailerTransport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465, false for other ports
      auth: { user, pass },
      pool: true,           // use pooled connections for bulk sending
      maxConnections: 5,
      maxMessages: 100,
      tls: { rejectUnauthorized: false }
    });

    // Verify connection on first use
    nodemailerTransport.verify()
      .then(() => console.log('[EMAIL] Nodemailer SMTP connected successfully'))
      .catch(err => console.error('[EMAIL] Nodemailer SMTP verification failed:', err.message));
  }
  return nodemailerTransport;
}

async function sendWithNodemailer({ to, subject, html, text, attachments = [], idempotencyKey }) {
  const transport = getNodemailerTransport();
  if (!transport) return { delivered: false, error: 'SMTP is not configured (SMTP_USER / SMTP_PASS missing)' };

  const sender = process.env.SENDER_EMAIL || process.env.SMTP_USER;
  const recipients = Array.isArray(to) ? to : [to];

  const mailOptions = {
    from: sender,
    to: recipients.join(', '),
    subject,
    html,
    text,
    attachments: attachments.map(item => ({
      filename: item.filename,
      content: Buffer.isBuffer(item.content) ? item.content : Buffer.from(item.content, 'base64')
    }))
  };

  const info = await transport.sendMail(mailOptions);
  return {
    delivered: true,
    dev_mode: false,
    email_id: info.messageId,
    intended_recipients: recipients,
    actual_recipients: recipients,
    redirected: false
  };
}

// ============================================================================
// RESEND — PRESERVED (activate by setting EMAIL_PROVIDER=resend in .env)
// ============================================================================
let resendClient = null;
let nextSendAt = 0;
let sendChain = Promise.resolve();
let queuedSends = 0;

const APP_URL = () => process.env.FRONTEND_URL || process.env.APP_URL;
const HAS_KEY = () => {
  if (EMAIL_PROVIDER === 'nodemailer') {
    return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
  }
  return Boolean(process.env.RESEND_API_KEY);
};

function deliveryConfig() {
  const sender = process.env.SENDER_EMAIL;
  const testMode = process.env.RESEND_TEST_MODE === 'true';
  const testRecipient = process.env.RESEND_TEST_RECIPIENT;
  if (!sender) throw new Error('SENDER_EMAIL is not configured');
  if (testMode && !testRecipient) throw new Error('RESEND_TEST_RECIPIENT is not configured');
  return { sender, testMode, testRecipient };
}

function resendClientInstance() {
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
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
  if (!process.env.RESEND_API_KEY) return { delivered: false, error: 'RESEND_API_KEY is not configured' };

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
    redirected: testMode
  };
}

// ============================================================================
// UNIFIED sendEmail — routes to active provider
// ============================================================================
async function sendEmail({ to, subject, html, text, attachments = [], idempotencyKey }) {
  const intendedRecipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!intendedRecipients.length) return { delivered: false, error: 'No recipient email address' };
  if (!HAS_KEY()) return { delivered: false, error: 'Email service is unavailable' };

  try {
    if (EMAIL_PROVIDER === 'resend') {
      return await sendWithResend({ to: intendedRecipients, subject, html, text, attachments, idempotencyKey });
    }
    // Default: nodemailer
    return await sendWithNodemailer({ to: intendedRecipients, subject, html, text, attachments, idempotencyKey });
  } catch (error) {
    console.error(`[EMAIL:${EMAIL_PROVIDER.toUpperCase()}:ERR]`, error.message || error);
    return { delivered: false, dev_mode: false, error: error.message || String(error) };
  }
}

// ============================================================================
// HIGH-LEVEL EMAIL FUNCTIONS (unchanged — they all call sendEmail internally)
// ============================================================================
async function sendVerificationEmail(user, code) {
  const result = await sendEmail({
    to: user.email,
    subject: 'Verify your CampusCert email',
    html: `<div style="font-family:Arial,sans-serif"><h2>Welcome, ${escapeHtml(user.name)}</h2><p>Your verification code is:</p><h1 style="letter-spacing: 4px; color: #4f46e5;">${code}</h1><p>Enter this code to activate your account.</p></div>`,
    text: `Your verification code is: ${code}`,
    idempotencyKey: `email-verification/${user.id}/${code}`
  });
  if (result.delivered) result.code = code;
  return result;
}

async function sendPasswordResetEmail(user, token) {
  const link = `${APP_URL()}/auth/reset-password?token=${token}`;
  const result = await sendEmail({
    to: user.email,
    subject: 'Reset your CampusCert password',
    html: `<div style="font-family:Arial,sans-serif"><h2>Password reset</h2><p>This link expires in one hour.</p><p><a href="${link}">Reset password</a></p></div>`,
    text: `Reset your password: ${link}`,
    idempotencyKey: `password-reset/${user.id}/${token.slice(0, 12)}`
  });
  return result;
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

  const result = await sendEmail({
    to: email,
    subject: `Invitation to join ${organizationName}`,
    html,
    text,
    idempotencyKey: `invite/${email}/${Date.now()}`
  });
  return result;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

module.exports = { sendEmail, sendVerificationEmail, sendPasswordResetEmail, sendInviteEmail, HAS_KEY, escapeHtml };