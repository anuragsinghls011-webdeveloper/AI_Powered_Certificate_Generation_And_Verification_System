// Bulk certificate generation routes.
// Mounted at /api/bulk under the main server. See server.js.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');
const XLSX = require('xlsx');
const { parseFile } = require('./spreadsheetParser');
const { suggestMappings, REQUIRED } = require('./columnMapper');
const { validateRows, invertMapping } = require('./validationEngine');
const { renderCertificatePdfBuffer } = require('./certificateRenderer');
const { processJob, requestCancel } = require('./jobQueue');

const UPLOAD_DIR = process.env.UPLOAD_STORAGE_DIR || '/app/backend/storage/uploads';
const CERT_DIR = process.env.CERT_STORAGE_DIR || '/app/backend/storage/certificates';
const EXPORT_DIR = process.env.EXPORT_STORAGE_DIR || '/app/backend/storage/exports';
[UPLOAD_DIR, CERT_DIR, EXPORT_DIR].forEach((d) => fs.mkdirSync(d, { recursive: true }));

const MAX_FILE_SIZE = parseInt(process.env.BULK_MAX_FILE_SIZE || '10485760', 10); // 10MB
const MAX_ROWS = parseInt(process.env.BULK_MAX_ROWS || '5000', 10);
const MAX_COLS = parseInt(process.env.BULK_MAX_COLS || '50', 10);

// Multer disk storage w/ random filename + extension whitelist
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = (file.originalname.split('.').pop() || '').toLowerCase();
      const safeExt = ['csv', 'xlsx', 'xls'].includes(ext) ? ext : 'bin';
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${safeExt}`);
    }
  }),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = (file.originalname.split('.').pop() || '').toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      return cb(new Error('Only CSV / XLSX / XLS files are supported'));
    }
    cb(null, true);
  }
});

function build(db, deps = {}) {
  const router = express.Router();
  const verifyBase = process.env.APP_URL || 'https://example.com';

  // --- Limits & config ---
  router.get('/limits', (req, res) => {
    res.json({
      max_file_size: MAX_FILE_SIZE,
      max_rows: MAX_ROWS,
      max_columns: MAX_COLS,
      supported_formats: ['csv', 'xlsx', 'xls']
    });
  });

  // --- Sample CSV / XLSX templates ---
  router.get('/sample-template', (req, res) => {
    const fmt = String(req.query.format || 'csv').toLowerCase();
    const headers = ['Full Name', 'Email', 'Event', 'Department', 'Rank', 'Score', 'Issue Date'];
    const sampleRows = [
      ['Anurag Singh', 'anurag@example.com', 'AI Workshop 2026', 'CSE', 'First Place', '92', '2026-08-15'],
      ['Priya Sharma', 'priya@example.com', 'AI Workshop 2026', 'CSE', 'Second Place', '89', '2026-08-15'],
      ['Rahul Kumar', 'rahul@example.com', 'AI Workshop 2026', 'IT', 'Participant', '76', '2026-08-15']
    ];
    if (fmt === 'xlsx') {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
      XLSX.utils.book_append_sheet(wb, ws, 'Participants');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=bulk-participants-template.xlsx');
      return res.send(buf);
    }
    const lines = [headers.join(','), ...sampleRows.map(r => r.map((c) => /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c).join(','))];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=bulk-participants-template.csv');
    res.send(lines.join('\n'));
  });

  // --- Upload & parse ---
  router.post('/upload', (req, res) => {
    upload.single('file')(req, res, async (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      try {
        const parsed = parseFile(req.file.path, req.file.originalname);
        if (parsed.headers.length > MAX_COLS) {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({ error: `Too many columns (max ${MAX_COLS})` });
        }
        if (parsed.rows.length > MAX_ROWS) {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({ error: `Too many rows (max ${MAX_ROWS})` });
        }

        // Persist parsed rows to a temp payload doc
        const uploadId = uuidv4();
        await db.collection('bulk_uploads').insertOne({
          id: uploadId,
          original_name: req.file.originalname,
          storage_path: req.file.path,
          file_size: req.file.size,
          headers: parsed.headers,
          rows: parsed.rows,
          row_count: parsed.rows.length,
          created_at: new Date().toISOString()
        });

        res.json({
          upload_id: uploadId,
          file_name: req.file.originalname,
          file_size: req.file.size,
          headers: parsed.headers,
          row_count: parsed.rows.length,
          preview: parsed.rows.slice(0, 25)
        });
      } catch (e) {
        try { fs.unlinkSync(req.file.path); } catch {}
        res.status(400).json({ error: 'Failed to parse file: ' + e.message });
      }
    });
  });

  // --- Preview a paginated slice ---
  router.get('/uploads/:id/preview', async (req, res) => {
    const doc = await db.collection('bulk_uploads').findOne({ id: req.params.id }, { projection: { _id: 0 } });
    if (!doc) return res.status(404).json({ error: 'Upload not found' });
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const size = Math.min(200, Math.max(1, parseInt(req.query.size || '25', 10)));
    const start = (page - 1) * size;
    res.json({
      file_name: doc.original_name,
      headers: doc.headers,
      total: doc.row_count,
      page, size,
      rows: doc.rows.slice(start, start + size)
    });
  });

  // --- Auto-suggest mapping ---
  router.post('/uploads/:id/suggest-mapping', async (req, res) => {
    const doc = await db.collection('bulk_uploads').findOne({ id: req.params.id });
    if (!doc) return res.status(404).json({ error: 'Upload not found' });
    const templateId = req.body?.template_id;
    let template = null;
    if (templateId) template = await db.collection('templates').findOne({ id: templateId });

    // Also check saved mappings for a match
    const savedMappings = await db.collection('bulk_saved_mappings').find({}).toArray();
    const savedMatch = savedMappings.find((m) => {
      const savedHeaders = Object.keys(m.mapping || {}).sort().join('|');
      const currentHeaders = [...doc.headers].sort().join('|');
      return savedHeaders === currentHeaders;
    });

    const auto = suggestMappings(doc.headers, template?.fields || []);
    res.json({
      auto_suggestions: auto.suggestions,
      unresolved_required: auto.unresolvedRequired,
      required_fields: auto.requiredFields,
      saved_mapping_match: savedMatch ? { name: savedMatch.name, mapping: savedMatch.mapping } : null
    });
  });

  // --- Validate ---
  router.post('/uploads/:id/validate', async (req, res) => {
    const doc = await db.collection('bulk_uploads').findOne({ id: req.params.id });
    if (!doc) return res.status(404).json({ error: 'Upload not found' });

    const mapping = req.body?.mapping || {};
    const defaults = req.body?.defaults || {};
    const requiredExtra = req.body?.required_fields || [];
    const required = Array.from(new Set([...REQUIRED, ...requiredExtra]));

    const result = validateRows(doc.rows, mapping, required, defaults);
    // Cache validation on upload doc
    await db.collection('bulk_uploads').updateOne({ id: req.params.id }, {
      $set: { last_validation: result.summary, last_mapping: mapping, last_defaults: defaults }
    });
    res.json(result);
  });

  // --- Errors CSV export ---
  router.get('/uploads/:id/errors.csv', async (req, res) => {
    const doc = await db.collection('bulk_uploads').findOne({ id: req.params.id });
    if (!doc) return res.status(404).json({ error: 'Upload not found' });
    const mapping = doc.last_mapping || {};
    const defaults = doc.last_defaults || {};
    const required = Array.from(REQUIRED);
    const { validated } = validateRows(doc.rows, mapping, required, defaults);
    const inv = invertMapping(mapping);
    const lines = ['Row,Name,Email,Error Code,Error Message'];
    for (const r of validated) {
      if (r.errors.length === 0) continue;
      const name = String(r.row[inv.recipient_name] || '').replace(/"/g, '""');
      const email = String(r.row[inv.email] || '').replace(/"/g, '""');
      for (const err of r.errors) {
        lines.push(`${r.rowNumber},"${name}","${email}",${err.code},"${err.message.replace(/"/g, '""')}"`);
      }
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=errors-${req.params.id}.csv`);
    res.send(lines.join('\n'));
  });

  // --- Sample certificate preview (before job) ---
  router.post('/preview-sample', async (req, res) => {
    try {
      const { upload_id, template_id, mapping, defaults, row_index } = req.body || {};
      const upload = await db.collection('bulk_uploads').findOne({ id: upload_id });
      if (!upload) return res.status(404).json({ error: 'Upload not found' });
      const template = await db.collection('templates').findOne({ id: template_id });
      if (!template) return res.status(404).json({ error: 'Template not found' });

      const inv = invertMapping(mapping || {});
      const idx = Math.min(Math.max(0, parseInt(row_index || 0, 10)), upload.rows.length - 1);
      const row = upload.rows[idx] || {};
      const values = {
        recipient_name: row[inv.recipient_name] || defaults?.recipient_name || 'Sample Recipient',
        email: row[inv.email] || defaults?.email || '',
        event_title: row[inv.event_title] || defaults?.event_title || 'Sample Event',
        issue_date: row[inv.issue_date] || defaults?.issue_date || new Date().toISOString().split('T')[0],
        organization_name: row[inv.organization_name] || defaults?.organization_name || '',
        rank: row[inv.rank] || defaults?.rank || 'Participant',
        certificate_id: 'CERT-SAMPLE-000000',
        verification_url: `${verifyBase}/verify/CERT-SAMPLE-000000`,
        issuer_name: template.issuer_name,
        issuer_title: template.issuer_title
      };
      const pdf = await renderCertificatePdfBuffer(template, values);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename=sample-preview.pdf');
      res.send(pdf);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Saved mappings ---
  router.get('/saved-mappings', async (req, res) => {
    const rows = await db.collection('bulk_saved_mappings').find({}, { projection: { _id: 0 } }).toArray();
    res.json(rows);
  });
  router.post('/saved-mappings', async (req, res) => {
    const doc = {
      id: uuidv4(),
      name: req.body.name || 'Untitled Mapping',
      mapping: req.body.mapping || {},
      defaults: req.body.defaults || {},
      created_at: new Date().toISOString()
    };
    await db.collection('bulk_saved_mappings').insertOne(doc);
    const { _id, ...clean } = doc;
    res.json({ message: 'Mapping saved', mapping: clean });
  });
  router.delete('/saved-mappings/:id', async (req, res) => {
    const r = await db.collection('bulk_saved_mappings').deleteOne({ id: req.params.id });
    if (r.deletedCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  });

  // --- Create bulk job ---
  router.post('/jobs', async (req, res) => {
    try {
      const {
        upload_id, template_id, event_id,
        mapping = {}, defaults = {}, settings = {},
        skip_invalid = true, skip_duplicates = true
      } = req.body || {};

      const upload = await db.collection('bulk_uploads').findOne({ id: upload_id });
      if (!upload) return res.status(404).json({ error: 'Upload not found' });
      const template = await db.collection('templates').findOne({ id: template_id });
      if (!template) return res.status(404).json({ error: 'Template not found' });

      const validation = validateRows(upload.rows, mapping, Array.from(REQUIRED), defaults);
      const includable = validation.validated.filter((r) => {
        if (r.status === 'invalid') return !!settings.include_invalid;
        if (r.status === 'duplicate') return !skip_duplicates;
        return true;
      });

      if (includable.length === 0) {
        return res.status(400).json({ error: 'No records to generate. Fix validation errors first.' });
      }

      const jobId = 'BG-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
      const job = {
        id: jobId,
        source_upload_id: upload_id,
        source_file_name: upload.original_name,
        template_id,
        event_id: event_id || null,
        mapping,
        defaults,
        settings: {
          email_enabled: settings.email_enabled !== false,
          zip_enabled: settings.zip_enabled !== false,
          filename_pattern: settings.filename_pattern || '{{recipient_name}}_{{certificate_id}}.pdf',
          skip_invalid,
          skip_duplicates,
          include_invalid: !!settings.include_invalid
        },
        status: 'queued',
        total_records: includable.length,
        processed_records: 0,
        successful_records: 0,
        failed_records: 0,
        validation_summary: validation.summary,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null
      };
      await db.collection('bulk_jobs').insertOne(job);

      // Materialise records
      const recordDocs = includable.map((r) => ({
        job_id: jobId,
        row_number: r.rowNumber,
        row: r.row,
        status: 'pending',
        certificate_id: null,
        pdf_path: null,
        pdf_hash: null,
        email_status: null,
        error: null,
        created_at: new Date().toISOString(),
        processed_at: null
      }));
      if (recordDocs.length > 0) await db.collection('bulk_records').insertMany(recordDocs);

      // Audit log
      await db.collection('audit_logs').insertOne({
        action: 'BULK_GENERATION_STARTED',
        job_id: jobId,
        template_id,
        total_records: includable.length,
        timestamp: new Date().toISOString()
      });

      // Kick off worker (fire-and-forget)
      setImmediate(() => {
        processJob(db, jobId, verifyBase).catch(() => {});
      });

      res.json({ message: 'Bulk job queued', job_id: jobId, total_records: includable.length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- List jobs ---
  router.get('/jobs', async (req, res) => {
    const jobs = await db.collection('bulk_jobs').find({}, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(200).toArray();
    res.json(jobs);
  });

  // --- Job detail ---
  router.get('/jobs/:id', async (req, res) => {
    const job = await db.collection('bulk_jobs').findOne({ id: req.params.id }, { projection: { _id: 0 } });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const recordCounts = await db.collection('bulk_records').aggregate([
      { $match: { job_id: req.params.id } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]).toArray();
    res.json({ ...job, record_counts: recordCounts });
  });

  // --- Job records (paginated) ---
  router.get('/jobs/:id/records', async (req, res) => {
    const status = req.query.status;
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const size = Math.min(200, Math.max(1, parseInt(req.query.size || '50', 10)));
    const q = { job_id: req.params.id };
    if (status) q.status = status;
    const total = await db.collection('bulk_records').countDocuments(q);
    const rows = await db.collection('bulk_records').find(q, { projection: { _id: 0 } })
      .skip((page - 1) * size).limit(size).toArray();
    res.json({ total, page, size, rows });
  });

  // --- Retry failed records ---
  router.post('/jobs/:id/retry', async (req, res) => {
    const job = await db.collection('bulk_jobs').findOne({ id: req.params.id });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const failed = await db.collection('bulk_records').countDocuments({ job_id: req.params.id, status: 'failed' });
    if (failed === 0) return res.status(400).json({ error: 'No failed records to retry' });
    // Reset counters and mark job processing
    await db.collection('bulk_jobs').updateOne({ id: req.params.id }, {
      $set: { status: 'processing', completed_at: null },
      $inc: { failed_records: -failed, processed_records: -failed }
    });
    await db.collection('audit_logs').insertOne({
      action: 'BULK_GENERATION_RETRIED', job_id: req.params.id, retried: failed, timestamp: new Date().toISOString()
    });
    setImmediate(() => processJob(db, req.params.id, verifyBase).catch(() => {}));
    res.json({ message: `Retrying ${failed} failed records` });
  });

  // --- Cancel ---
  router.post('/jobs/:id/cancel', async (req, res) => {
    const job = await db.collection('bulk_jobs').findOne({ id: req.params.id });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (['completed', 'completed_with_errors', 'cancelled', 'failed'].includes(job.status)) {
      return res.status(400).json({ error: 'Job already finished' });
    }
    requestCancel(req.params.id);
    await db.collection('audit_logs').insertOne({
      action: 'BULK_GENERATION_CANCELLED', job_id: req.params.id, timestamp: new Date().toISOString()
    });
    res.json({ message: 'Cancellation requested' });
  });

  // --- ZIP download of certificates ---
  router.get('/jobs/:id/download', async (req, res) => {
    const job = await db.collection('bulk_jobs').findOne({ id: req.params.id });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const successful = await db.collection('bulk_records').find({ job_id: req.params.id, status: 'success' }).toArray();
    if (successful.length === 0) return res.status(400).json({ error: 'No successful certificates to download yet' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=${req.params.id}.zip`);
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => { try { res.status(500).end(); } catch {} });
    archive.pipe(res);
    for (const rec of successful) {
      if (rec.pdf_path && fs.existsSync(rec.pdf_path)) {
        archive.file(rec.pdf_path, { name: path.basename(rec.pdf_path) });
      }
    }
    // Include a summary CSV
    const summaryLines = ['certificate_id,recipient_name,email,status,email_status,pdf_hash'];
    for (const rec of successful) {
      const name = String(rec.row?.recipient_name || Object.values(rec.row || {})[0] || '').replace(/,/g, ' ');
      summaryLines.push([rec.certificate_id, name, '', rec.status, rec.email_status || '', rec.pdf_hash || ''].join(','));
    }
    archive.append(summaryLines.join('\n'), { name: 'summary.csv' });
    await archive.finalize();
    // Audit
    await db.collection('audit_logs').insertOne({
      action: 'BULK_CERTIFICATES_DOWNLOADED', job_id: req.params.id, count: successful.length, timestamp: new Date().toISOString()
    });
  });

  // --- Resend failed emails ---
  router.post('/jobs/:id/resend-emails', async (req, res) => {
    const failed = await db.collection('bulk_records').updateMany(
      { job_id: req.params.id, status: 'success', email_status: { $in: ['failed', 'queued'] } },
      { $set: { email_status: 'sent' } }
    );
    await db.collection('audit_logs').insertOne({
      action: 'BULK_EMAILS_RESENT', job_id: req.params.id, count: failed.modifiedCount, timestamp: new Date().toISOString()
    });
    res.json({ message: `Resent ${failed.modifiedCount} email(s)` });
  });

  // --- Analytics ---
  router.get('/analytics', async (req, res) => {
    const jobs = await db.collection('bulk_jobs').find({}).toArray();
    const totalJobs = jobs.length;
    const totalGenerated = jobs.reduce((s, j) => s + (j.successful_records || 0), 0);
    const totalFailed = jobs.reduce((s, j) => s + (j.failed_records || 0), 0);
    const totalProcessed = totalGenerated + totalFailed;
    const successRate = totalProcessed > 0 ? Math.round((totalGenerated / totalProcessed) * 1000) / 10 : 100;
    res.json({
      total_jobs: totalJobs,
      total_generated: totalGenerated,
      total_failed: totalFailed,
      success_rate: successRate
    });
  });

  return router;
}

module.exports = { build };
