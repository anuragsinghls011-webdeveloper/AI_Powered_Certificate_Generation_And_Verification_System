const express = require('express');
const router = express.Router();
const { getCertificatesCol, getEventsCol, getDB } = require('../config/db');

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

module.exports = router;
