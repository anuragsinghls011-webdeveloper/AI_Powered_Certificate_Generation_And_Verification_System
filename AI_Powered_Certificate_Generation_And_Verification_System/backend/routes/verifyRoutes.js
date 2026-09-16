const express = require('express');
const router = express.Router();
const { getCertificatesCol, getEventsCol, getDB } = require('../config/db');
const { streamCertificatePdf } = require('../services/pdfService');
const storageService = require('../services/storageService');

router.get('/:cert_id', async (req, res) => {
  try {
    const cert_id = req.params.cert_id;
    const cert = await getCertificatesCol().findOne({ cert_id }, { projection: { _id: 0 } });
    if (!cert) {
      return res.status(404).json({ error: 'Certificate not found or ID is invalid.' });
    }
    
    // Fetch event for description
    const event = await getEventsCol().findOne({ id: cert.event_id });
    
    // Fetch organization for accurate signatory branding
    let orgName = 'Authorized Organization';
    if (cert.organization_id) {
      const org = await getDB().collection('organizations').findOne({ id: cert.organization_id });
      if (org) orgName = org.name;
    }

    const result = {
      ...cert,
      event_description: event?.description || 'No additional description provided for this event.',
      organization_name: orgName
    };
    
    res.json(result);
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: 'Verification failed due to server error.' });
  }
});

router.get('/:cert_id/download-pdf', async (req, res) => {
  try {
    const cert_id = req.params.cert_id;
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
    
    const template = await getDB().collection('templates').findOne({ id: cert.template_id });
    if (!template) return res.status(404).json({ error: 'Template not found.' });

    await streamCertificatePdf(cert, template, res);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Download failed due to server error.' });
  }
});

module.exports = router;
