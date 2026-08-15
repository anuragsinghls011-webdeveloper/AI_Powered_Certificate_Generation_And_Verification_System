// SendGrid email sender with dev-mode fallback: if SENDGRID_API_KEY is missing,
// the "email" is logged and the link is returned to the API caller for testing.

let sgMail = null;
try { sgMail = require('@sendgrid/mail'); } catch { /* dep optional */ }

const APP_URL = () => process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000';
const SENDER = () => process.env.SENDER_EMAIL || 'no-reply@campuscert.local';
const HAS_KEY = () => !!process.env.SENDGRID_API_KEY;

if (HAS_KEY() && sgMail) sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendEmail({ to, subject, html, text }) {
  if (!HAS_KEY() || !sgMail) {
    // Dev-mode: log and return dev_link
    console.log(`[EMAIL:DEV] to=${to} subject="${subject}"\n${text || html}`);
    return { delivered: false, dev_mode: true };
  }
  try {
    await sgMail.send({ to, from: SENDER(), subject, html, text });
    return { delivered: true, dev_mode: false };
  } catch (err) {
    console.error('[EMAIL:ERR]', err.message || err);
    return { delivered: false, dev_mode: false, error: err.message || String(err) };
  }
}

async function sendVerificationEmail(user, token) {
  const link = `${APP_URL()}/auth/verify-email?token=${token}`;
  const subject = 'Verify your CampusCert Pro email';
  const html = `<div style="font-family:sans-serif"><h2>Welcome, ${escapeHtml(user.name)}</h2><p>Confirm your email to activate your CampusCert Pro account.</p><p><a href="${link}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Verify email</a></p><p>Or paste this link:<br><code>${link}</code></p></div>`;
  const text = `Verify your email: ${link}`;
  const result = await sendEmail({ to: user.email, subject, html, text });
  return { ...result, link };
}

async function sendPasswordResetEmail(user, token) {
  const link = `${APP_URL()}/auth/reset-password?token=${token}`;
  const subject = 'Reset your CampusCert Pro password';
  const html = `<div style="font-family:sans-serif"><h2>Password reset</h2><p>Someone requested a password reset for your account. This link expires in 1 hour.</p><p><a href="${link}" style="background:#dc2626;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Reset password</a></p><p>If you didn't request this, ignore this email.</p></div>`;
  const text = `Reset your password: ${link}`;
  const result = await sendEmail({ to: user.email, subject, html, text });
  return { ...result, link };
}

function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

module.exports = { sendEmail, sendVerificationEmail, sendPasswordResetEmail, HAS_KEY };
