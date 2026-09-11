const { escapeHtml } = require('../utils/emailService');

function frame(content, footer) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 12px;font-family:Arial,sans-serif;color:#172033"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border:1px solid #dbe3ee"><tr><td style="padding:32px"><div style="font-size:12px;font-weight:700;letter-spacing:1px;color:#0f766e">CAMPUSCERT</div>${content}<p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.6;color:#64748b">${footer}</p></td></tr></table></td></tr></table>`;
}

function certificateTemplate({ recipientName, eventTitle, certificateId, verificationUrl }) {
  const name = escapeHtml(recipientName);
  const event = escapeHtml(eventTitle || 'your event');
  const certId = escapeHtml(certificateId);
  const url = escapeHtml(verificationUrl);
  return {
    subject: `Your certificate for ${eventTitle || 'CampusCert'}`,
    text: `Hello ${recipientName}, your certificate for ${eventTitle || 'your event'} is attached. Certificate ID: ${certificateId}. Verify: ${verificationUrl}`,
    html: frame(`<h1 style="margin:20px 0 12px;font-size:28px;line-height:1.2">Your certificate is ready</h1><p style="font-size:16px;line-height:1.7">Hello ${name},</p><p style="font-size:16px;line-height:1.7">Congratulations on completing <strong>${event}</strong>. Your official certificate is attached as a PDF.</p><table role="presentation" width="100%" style="margin:24px 0;background:#f8fafc;border-left:4px solid #0f766e"><tr><td style="padding:16px"><strong>Certificate ID</strong><br><span style="font-family:monospace">${certId}</span></td></tr></table><p><a href="${url}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 18px;font-weight:700">Verify certificate</a></p>`, 'This message was sent automatically by CampusCert Admin. Keep the attached certificate for your records.')
  };
}

function eventReportTemplate({ adminName, eventTitle, summary, completedAt }) {
  const name = escapeHtml(adminName || 'Administrator');
  const event = escapeHtml(eventTitle);
  const completed = escapeHtml(completedAt);
  return {
    subject: `Completed event report: ${eventTitle}`,
    text: `${eventTitle} is complete. Attached are the Excel and CSV reports. Total certificates: ${summary.total}; active: ${summary.active}; revoked: ${summary.revoked}.`,
    html: frame(`<h1 style="margin:20px 0 12px;font-size:28px;line-height:1.2">Event reports are ready</h1><p style="font-size:16px;line-height:1.7">Hello ${name},</p><p style="font-size:16px;line-height:1.7"><strong>${event}</strong> has been marked complete. The Excel workbook and CSV certificate report are attached.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:#f8fafc"><tr><td style="padding:16px"><strong>${summary.total}</strong><br><span style="color:#64748b">Total certificates</span></td><td style="padding:16px"><strong>${summary.active}</strong><br><span style="color:#64748b">Active</span></td><td style="padding:16px"><strong>${summary.revoked}</strong><br><span style="color:#64748b">Revoked</span></td></tr></table><p style="font-size:13px;color:#64748b">Completed at ${completed}</p>`, 'These reports contain student information. Store and share them according to your institution’s privacy policy.')
  };
}

module.exports = { certificateTemplate, eventReportTemplate };