const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/authMiddleware');
const { workLimit } = require('../services/workload');
const {
  getAllCertificates,
  generateBulkCertificates,
  createCertificate,
  getCertificateById,
  revokeCertificate,
  sendEmail,
  downloadPdf,
  revokeBulkCertificates
} = require('../controllers/certificateController');

router.get('/', requirePermission('certificates.read'), getAllCertificates);
router.post('/generate-bulk', requirePermission('bulk.create'), workLimit('generation'), generateBulkCertificates);
router.post('/', requirePermission('certificates.create'), workLimit('generation'), createCertificate);
router.get('/:cert_id', requirePermission('certificates.read'), getCertificateById);
router.delete('/:cert_id', requirePermission('certificates.delete'), revokeCertificate);
router.post('/:cert_id/send-email', requirePermission('certificates.create'), workLimit('email'), sendEmail);
router.get('/:cert_id/download-pdf', requirePermission('certificates.read'), workLimit('pdf'), downloadPdf);
router.post('/bulk-revoke', requirePermission('certificates.delete'), revokeBulkCertificates);

module.exports = router;
