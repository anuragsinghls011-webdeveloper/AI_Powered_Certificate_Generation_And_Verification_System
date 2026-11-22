const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { getCertificatesCol, getEventsCol, getDB } = require('../config/db');
const { streamCertificatePdf } = require('../services/pdfService');
const { workLimit } = require('../services/workload');
const storageService = require('../services/storageService');

const CERT_ID_REGEX = /^CERT-\d{4}-[A-Za-z0-9_-]{4,32}$/;

const verifyLookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many verification requests. Please try again shortly.' }
});

const verifyPdfLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many PDF download requests. Please try again shortly.' }
});

const PUBLIC_CERT_PROJECTION = {
  _id: 0,
  cert_id: 1,
  recipient_name: 1,
  event_id: 1,
  event_title: 1,
  event_category: 1,
  role: 1,
  grade: 1,
  issue_date: 1,
  issuer_name: 1,
  issuer_title: 1,
  verification_url: 1,
  qr_code_b64: 1,
  status: 1,
  organization_id: 1
};

function setNoIndexHeaders(res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
}

router.get('/:cert_id', verifyLookupLimiter, async (req, res) => {
  try {
    setNoIndexHeaders(res);
    const cert_id = String(req.params.cert_id || '').trim();
    if (!CERT_ID_REGEX.test(cert_id)) {
      return res.status(400).json({ error: 'Invalid certificate ID format.' });
    }

    const cert = await getCertificatesCol().findOne({ cert_id }, { projection: PUBLIC_CERT_PROJECTION });
    if (!cert) {
      return res.status(404).json({ error: 'Certificate not found or ID is invalid.' });
    }

    const [event, org] = await Promise.all([
      cert.event_id
        ? getEventsCol().findOne({ id: cert.event_id }, { projection: { _id: 0, description: 1 } })
        : null,
      cert.organization_id
        ? getDB().collection('organizations').findOne({ id: cert.organization_id }, { projection: { _id: 0, name: 1 } })
        : null
    ]);

    // Strictly sanitized public DTO — never expose recipient_email, pdf_path, issuance_key, or internal IDs.
    res.json({
      cert_id: cert.cert_id,
      recipient_name: cert.recipient_name,
      event_title: cert.event_title,
      event_category: cert.event_category,
      role: cert.role,
      grade: cert.grade,
      issue_date: cert.issue_date,
      issuer_name: cert.issuer_name,
      issuer_title: cert.issuer_title,
      verification_url: cert.verification_url,
      qr_code_b64: cert.qr_code_b64,
      status: cert.status,
      event_description: event?.description || 'No additional description provided for this event.',
      organization_name: org?.name || 'Authorized Organization'
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: 'Verification failed due to server error.' });
  }
});

router.get('/:cert_id/download-pdf', verifyPdfLimiter, workLimit('pdf'), async (req, res) => {
  try {
    setNoIndexHeaders(res);
    const cert_id = String(req.params.cert_id || '').trim();
    if (!CERT_ID_REGEX.test(cert_id)) {
      return res.status(400).json({ error: 'Invalid certificate ID format.' });
    }

    const cert = await getCertificatesCol().findOne({ cert_id }, { projection: { _id: 0 } });
    if (!cert) return res.status(404).json({ error: 'Certificate not found.' });

    if (cert.pdf_path) {
      try {
        const { stream, length } = await storageService.downloadPdfStream(cert.pdf_path);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Certificate_${cert.cert_id}.pdf`);
        if (length) res.setHeader('Content-Length', length);
        return stream.pipe(res);
      } catch (e) {
        console.warn('Failed to fetch PDF from storage, generating on-the-fly:', e.message);
      }
    }

    let template = cert.template_id ? await getDB().collection('templates').findOne({ id: cert.template_id }) : null;
    if (!template) {
      template = await getDB().collection('templates').findOne({});
    }
    if (!template) return res.status(404).json({ error: 'Template not found.' });

    await streamCertificatePdf(cert, template, res);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Download failed due to server error.' });
  }
});

module.exports = router;
