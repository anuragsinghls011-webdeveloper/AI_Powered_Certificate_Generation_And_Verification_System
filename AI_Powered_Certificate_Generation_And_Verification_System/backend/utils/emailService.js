const { Resend } = require('resend');
const limits = require('../config/security');

let resendClient = null;
let nextSendAt = 0;
let sendChain = Promise.resolve();
let queuedSends = 0;

const APP_URL = () => process.env.FRONTEND_URL || process.env.APP_URL;
const HAS_KEY = () => Boolean(process.env.RESEND_API_KEY);

function deliveryConfig() {
  const sender = process.env.SENDER_EMAIL;
  const testMode = process.env.RESEND_TEST_MODE === 'true';
  const testRecipient = process.env.RESEND_TEST_RECIPIENT;
  if (!sender) throw new Error('SENDER_EMAIL is not configured');
  if (testMode && !testRecipient) throw new Error('RESEND_TEST_RECIPIENT is not configured');
  return { sender, testMode, testRecipient };
}

function client() {
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

async function sendEmail({ to, subject, html, text, attachments = [], idempotencyKey }) {
  const intendedRecipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!intendedRecipients.length) return { delivered: false, error: 'No recipient email address' };
  if (!HAS_KEY()) return { delivered: false, error: 'Email service is unavailable' };

  try {
    const { sender, testMode, testRecipient } = deliveryConfig();
    const actualRecipients = testMode ? [testRecipient] : intendedRecipients;
    const encodedAttachments = attachments.map(item => ({
      filename: item.filename,
      content: Buffer.isBuffer(item.content) ? item.content.toString('base64') : item.content
    }));
    const totalBytes = attachments.reduce((sum, item) => sum + (Buffer.isBuffer(item.content) ? item.content.length : 0), 0);
    if (totalBytes > 30 * 1024 * 1024) throw new Error('Email attachments exceed the 30 MB application limit');

    const result = await scheduleSend(() => require('../services/workload').withSlot('email', () => client().emails.send({
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
  } catch (error) {
    console.error('[RESEND:ERR]', error.message || error);
    return { delivered: false, dev_mode: false, error: error.message || String(error) };
  }
}

async function sendVerificationEmail(user, token) {
  const link = `${APP_URL()}/auth/verify-email?token=${token}`;
  const result = await sendEmail({
    to: user.email,
    subject: 'Verify your CampusCert email',
    html: `<div style="font-family:Arial,sans-serif"><h2>Welcome, ${escapeHtml(user.name)}</h2><p>Confirm your email to activate your CampusCert account.</p><p><a href="${link}">Verify email</a></p></div>`,
    text: `Verify your email: ${link}`,
    idempotencyKey: `email-verification/${user.id}/${token.slice(0, 12)}`
  });
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

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

module.exports = { sendEmail, sendVerificationEmail, sendPasswordResetEmail, HAS_KEY, escapeHtml };