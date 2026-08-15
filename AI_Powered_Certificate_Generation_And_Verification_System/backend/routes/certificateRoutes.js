const express = require('express');
const router = express.Router();
const {
  getAllCertificates,
  generateBulkCertificates,
  createCertificate,
  getCertificateById,
  revokeCertificate,
  sendEmail,
  downloadPdf
} = require('../controllers/certificateController');

router.get('/', getAllCertificates);
router.post('/generate-bulk', generateBulkCertificates);
router.post('/', createCertificate);
router.get('/:cert_id', getCertificateById);
router.delete('/:cert_id', revokeCertificate);
router.post('/:cert_id/send-email', sendEmail);
router.get('/:cert_id/download-pdf', downloadPdf);

module.exports = router;
