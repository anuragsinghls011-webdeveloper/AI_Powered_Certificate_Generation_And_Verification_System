const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
require('dotenv').config();
const bulkModule = require('./modules/bulkGeneration/routes');

const app = express();
const PORT = process.env.PORT || 8001;
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cert_management_db';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

let db, eventsCol, templatesCol, certificatesCol;

async function connectDB() {
  try {
    const client = new MongoClient(MONGO_URL);
    await client.connect();
    db = client.db(DB_NAME);
    eventsCol = db.collection('events');
    templatesCol = db.collection('templates');
    certificatesCol = db.collection('certificates');
    console.log('Connected to MongoDB successfully');
    // Mount bulk generation routes now that db is available
    app.use('/api/bulk', bulkModule.build(db));
    await seedInitialData();
  } catch (err) {
    console.error('MongoDB connection error:', err);
  }
}

async function seedInitialData() {
  const tplCount = await templatesCol.countDocuments();
  if (tplCount === 0) {
    await templatesCol.insertMany([
      {
        id: 'tpl-modern',
        name: 'Modern Blue Minimal',
        style: 'modern',
        primary_color: '#2563eb',
        secondary_color: '#06b6d4',
        border_style: 'solid',
        issuer_name: 'Prof. Alan Turing',
        issuer_title: 'Director of Technology',
        background_image: '',
        fields: [
          { id: 'f1', type: 'recipient_name', label: 'Recipient Name', x: 100, y: 180, fontFamily: 'Helvetica-Bold', fontSize: 32, fontWeight: 'bold', fontStyle: 'normal', color: '#111827' },
          { id: 'f2', type: 'organization_name', label: 'Organization Name', x: 100, y: 120, fontFamily: 'Helvetica', fontSize: 14, fontWeight: '600', fontStyle: 'normal', color: '#2563eb' },
          { id: 'f3', type: 'rank', label: 'Rank / Position', x: 100, y: 240, fontFamily: 'Helvetica', fontSize: 16, fontWeight: 'bold', fontStyle: 'normal', color: '#059669' },
          { id: 'f4', type: 'certificate_qr', label: 'Certificate QR', x: 350, y: 300, fontFamily: 'Helvetica', fontSize: 12, fontWeight: 'normal', fontStyle: 'normal', color: '#000000' },
          { id: 'f5', type: 'certificate_link', label: 'Certificate Link', x: 100, y: 350, fontFamily: 'Helvetica', fontSize: 10, fontWeight: 'normal', fontStyle: 'normal', color: '#6b7280' }
        ]
      },
      {
        id: 'tpl-classic',
        name: 'Classic Gold Executive',
        style: 'classic',
        primary_color: '#b45309',
        secondary_color: '#78350f',
        border_style: 'double',
        issuer_name: 'Dr. Elizabeth Warren',
        issuer_title: 'University Chancellor',
        background_image: '',
        fields: [
          { id: 'f1', type: 'recipient_name', label: 'Recipient Name', x: 100, y: 180, fontFamily: 'Helvetica-Bold', fontSize: 36, fontWeight: 'bold', fontStyle: 'normal', color: '#78350f' },
          { id: 'f2', type: 'organization_name', label: 'Organization Name', x: 100, y: 110, fontFamily: 'Helvetica', fontSize: 14, fontWeight: '600', fontStyle: 'normal', color: '#b45309' },
          { id: 'f3', type: 'rank', label: 'Rank / Position', x: 100, y: 250, fontFamily: 'Helvetica', fontSize: 16, fontWeight: 'bold', fontStyle: 'normal', color: '#b45309' },
          { id: 'f4', type: 'certificate_qr', label: 'Certificate QR', x: 350, y: 300, fontFamily: 'Helvetica', fontSize: 12, fontWeight: 'normal', fontStyle: 'normal', color: '#000000' },
          { id: 'f5', type: 'certificate_link', label: 'Certificate Link', x: 100, y: 350, fontFamily: 'Helvetica', fontSize: 10, fontWeight: 'normal', fontStyle: 'normal', color: '#6b7280' }
        ]
      }
    ]);
  }

  const evCount = await eventsCol.countDocuments();
  if (evCount === 0) {
    await eventsCol.insertOne({
      id: 'evt-hack-2025',
      title: 'Global AI Hackathon 2025',
      category: 'Hackathon',
      date: '2025-10-15',
      description: '48-hour intense coding and LLM integration challenge.',
      organizer: 'Department of Computer Science',
      location: 'Main Auditorium & Virtual',
      created_at: new Date().toISOString()
    });
  }
}

connectDB();

// Events Routes
app.get('/api/events', async (req, res) => {
  try {
    const events = await eventsCol.find({}, { projection: { _id: 0 } }).toArray();
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/events', async (req, res) => {
  try {
    const event = {
      id: uuidv4(),
      title: req.body.title,
      category: req.body.category || 'Workshop',
      date: req.body.date || new Date().toISOString().split('T')[0],
      description: req.body.description || '',
      organizer: req.body.organizer,
      location: req.body.location || 'Main Campus',
      created_at: new Date().toISOString()
    };
    await eventsCol.insertOne(event);
    const { _id, ...cleanEvent } = event;
    res.json({ message: 'Event created successfully', event: cleanEvent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    const result = await eventsCol.deleteOne({ id: req.params.id });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Event not found' });
    res.json({ message: 'Event deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Templates & Design Studio Routes
app.get('/api/templates', async (req, res) => {
  try {
    const templates = await templatesCol.find({}, { projection: { _id: 0 } }).toArray();
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/templates', async (req, res) => {
  try {
    const template = {
      id: uuidv4(),
      name: req.body.name || 'Custom Template',
      style: req.body.style || 'modern',
      primary_color: req.body.primary_color || '#2563eb',
      secondary_color: req.body.secondary_color || '#06b6d4',
      border_style: req.body.border_style || 'double',
      issuer_name: req.body.issuer_name || 'Dean of Academic Affairs',
      issuer_title: req.body.issuer_title || 'University Chancellor',
      background_image: req.body.background_image || '',
      fields: req.body.fields || []
    };
    await templatesCol.insertOne(template);
    const { _id, ...cleanTpl } = template;
    res.json({ message: 'Template created successfully', template: cleanTpl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/templates/:id', async (req, res) => {
  try {
    const updateData = {
      name: req.body.name,
      style: req.body.style,
      primary_color: req.body.primary_color,
      secondary_color: req.body.secondary_color,
      border_style: req.body.border_style,
      issuer_name: req.body.issuer_name,
      issuer_title: req.body.issuer_title,
      background_image: req.body.background_image,
      fields: req.body.fields
    };
    const result = await templatesCol.updateOne({ id: req.params.id }, { $set: updateData });
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Template not found' });
    res.json({ message: 'Template updated successfully', template: { id: req.params.id, ...updateData } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/templates/:id', async (req, res) => {
  try {
    const result = await templatesCol.deleteOne({ id: req.params.id });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Template not found' });
    res.json({ message: 'Template deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Certificates Routes
app.get('/api/certificates', async (req, res) => {
  try {
    const { event_id, search } = req.query;
    let query = {};
    if (event_id) query.event_id = event_id;
    if (search) {
      query.$or = [
        { recipient_name: { $regex: search, $options: 'i' } },
        { recipient_email: { $regex: search, $options: 'i' } },
        { cert_id: { $regex: search, $options: 'i' } }
      ];
    }
    const certs = await certificatesCol.find(query, { projection: { _id: 0 } }).toArray();
    res.json(certs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/certificates/generate-bulk', async (req, res) => {
  try {
    const { event_id, template_id, participants, issue_date } = req.body;
    const event = await eventsCol.findOne({ id: event_id });
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const template = await templatesCol.findOne({ id: template_id });
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const createdCerts = [];
    for (const p of participants) {
      const certId = `CERT-${new Date().getFullYear()}-${uuidv4().slice(0, 8).toUpperCase()}`;
      const verificationUrl = `https://certverify.campus.edu/verify/${certId}`;
      const qrCodeB64 = await QRCode.toDataURL(verificationUrl);

      const certDoc = {
        cert_id: certId,
        event_id,
        event_title: event.title,
        event_category: event.category,
        template_id,
        recipient_name: p.name,
        recipient_email: p.email,
        role: p.role || 'Participant',
        grade: p.grade || 'Completed Successfully',
        issue_date: issue_date || new Date().toISOString().split('T')[0],
        issuer_name: template.issuer_name || 'Dean of Academic Affairs',
        issuer_title: template.issuer_title || 'University Chancellor',
        verification_url: verificationUrl,
        qr_code_b64: qrCodeB64.replace(/^data:image\/png;base64,/, ''),
        status: 'Active',
        sent_email: false,
        created_at: new Date().toISOString()
      };

      await certificatesCol.insertOne(certDoc);
      const { _id, ...cleanCert } = certDoc;
      createdCerts.push(cleanCert);
    }

    res.json({
      message: `Successfully generated ${createdCerts.length} certificates`,
      count: createdCerts.length,
      certificates: createdCerts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/certificates', async (req, res) => {
  try {
    const { event_id, template_id, name, email, role, grade, issue_date } = req.body;
    const event = await eventsCol.findOne({ id: event_id });
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const template = await templatesCol.findOne({ id: template_id });
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const certId = `CERT-${new Date().getFullYear()}-${uuidv4().slice(0, 8).toUpperCase()}`;
    const verificationUrl = `https://certverify.campus.edu/verify/${certId}`;
    const qrCodeB64 = await QRCode.toDataURL(verificationUrl);

    const certDoc = {
      cert_id: certId,
      event_id,
      event_title: event.title,
      event_category: event.category,
      template_id,
      recipient_name: name,
      recipient_email: email,
      role: role || 'Participant',
      grade: grade || 'Completed Successfully',
      issue_date: issue_date || new Date().toISOString().split('T')[0],
      issuer_name: template.issuer_name || 'Dean of Academic Affairs',
      issuer_title: template.issuer_title || 'University Chancellor',
      verification_url: verificationUrl,
      qr_code_b64: qrCodeB64.replace(/^data:image\/png;base64,/, ''),
      status: 'Active',
      sent_email: false,
      created_at: new Date().toISOString()
    };

    await certificatesCol.insertOne(certDoc);
    const { _id, ...cleanCert } = certDoc;
    res.json({ message: 'Certificate issued successfully', certificate: cleanCert });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/certificates/:cert_id', async (req, res) => {
  try {
    const cert = await certificatesCol.findOne({ cert_id: req.params.cert_id }, { projection: { _id: 0 } });
    if (!cert) return res.status(404).json({ error: 'Certificate not found or invalid ID' });
    res.json(cert);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/certificates/:cert_id', async (req, res) => {
  try {
    const result = await certificatesCol.updateOne({ cert_id: req.params.cert_id }, { $set: { status: 'Revoked' } });
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Certificate not found' });
    res.json({ message: 'Certificate revoked successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/certificates/:cert_id/send-email', async (req, res) => {
  try {
    const cert = await certificatesCol.findOne({ cert_id: req.params.cert_id });
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });

    await certificatesCol.updateOne({ cert_id: req.params.cert_id }, { $set: { sent_email: true } });
    res.json({
      message: `Certificate successfully dispatched via Email & SMS to ${cert.recipient_email}`,
      recipient: cert.recipient_email,
      cert_id: req.params.cert_id
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/certificates/:cert_id/download-pdf', async (req, res) => {
  try {
    const cert = await certificatesCol.findOne({ cert_id: req.params.cert_id });
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });

    const template = await templatesCol.findOne({ id: cert.template_id });

    const doc = new PDFDocument({ layout: 'landscape', size: 'LETTER', margin: 0 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Certificate_${cert.cert_id}.pdf`);
    doc.pipe(res);

    const pageW = doc.page.width;   // 792 pt for landscape LETTER
    const pageH = doc.page.height;  // 612 pt

    // If template has custom fields, render them; else render default layout
    if (template && Array.isArray(template.fields) && template.fields.length > 0) {
      // Custom-designed template with drag-and-drop layout
      // Background image (if provided as data URL or http URL)
      if (template.background_image && template.background_image.startsWith('data:image')) {
        try {
          const b64 = template.background_image.split(',')[1];
          const imgBuf = Buffer.from(b64, 'base64');
          doc.image(imgBuf, 0, 0, { width: pageW, height: pageH });
        } catch (e) { /* ignore invalid image */ }
      }

      // Borders using template colors
      if (template.border_style && template.border_style !== 'none') {
        const borderColor = template.primary_color || '#1e3a8a';
        const accentColor = template.secondary_color || '#eab308';
        doc.rect(20, 20, pageW - 40, pageH - 40).lineWidth(4).strokeColor(borderColor).stroke();
        doc.rect(30, 30, pageW - 60, pageH - 60).lineWidth(1.5).strokeColor(accentColor).stroke();
      }

      // Canvas coords are in an 792x560 design space -> scale to PDF page
      const scaleX = pageW / 792;
      const scaleY = pageH / 560;

      for (const f of template.fields) {
        const px = (f.x || 0) * scaleX;
        const py = (f.y || 0) * scaleY;

        if (f.type === 'certificate_qr') {
          const qrPng = Buffer.from(cert.qr_code_b64, 'base64');
          const size = 80 * scaleX;
          doc.image(qrPng, px, py, { width: size, height: size });
          continue;
        }

        // Resolve dynamic text
        let text = '';
        switch (f.type) {
          case 'recipient_name': text = cert.recipient_name; break;
          case 'organization_name': text = cert.issuer_name; break;
          case 'rank': text = cert.role; break;
          case 'event_title': text = cert.event_title; break;
          case 'issue_date': text = cert.issue_date; break;
          case 'certificate_id': text = cert.cert_id; break;
          case 'certificate_link': text = cert.verification_url; break;
          case 'custom_text': text = f.text || ''; break;
          default: text = f.label || '';
        }

        let font = f.fontFamily || 'Helvetica';
        // Map bold/italic hints
        if (f.fontWeight === 'bold' && !font.includes('Bold')) {
          if (font === 'Helvetica') font = 'Helvetica-Bold';
          else if (font === 'Times-Roman') font = 'Times-Bold';
          else if (font === 'Courier') font = 'Courier-Bold';
        }
        try { doc.font(font); } catch { doc.font('Helvetica'); }

        doc.fontSize((f.fontSize || 16) * scaleY)
          .fillColor(f.color || '#111827')
          .text(text || '', px, py, { lineBreak: false });
      }
    } else {
      // Default classic layout (fallback)
      doc.rect(30, 30, pageW - 60, pageH - 60).lineWidth(4).strokeColor('#1e3a8a').stroke();
      doc.rect(38, 38, pageW - 76, pageH - 76).lineWidth(1.5).strokeColor('#eab308').stroke();

      doc.font('Helvetica-Bold').fontSize(28).fillColor('#1e3a8a').text('CERTIFICATE OF APPRECIATION', 0, 90, { align: 'center' });
      doc.font('Helvetica').fontSize(14).fillColor('#4b5563').text('This is proudly presented to', 0, 135, { align: 'center' });
      doc.font('Helvetica-Bold').fontSize(32).fillColor('#111827').text(cert.recipient_name, 0, 175, { align: 'center' });
      doc.font('Helvetica').fontSize(13).fillColor('#374151').text(`for successfully participating and securing recognition as ${cert.role} in`, 0, 230, { align: 'center' });
      doc.font('Helvetica-Bold').fontSize(18).fillColor('#2563eb').text(cert.event_title, 0, 265, { align: 'center' });
      doc.font('Helvetica').fontSize(11).fillColor('#6b7280').text(`Issued Date: ${cert.issue_date} | Certificate ID: ${cert.cert_id}`, 0, 310, { align: 'center' });

      // Embed QR code
      try {
        const qrPng = Buffer.from(cert.qr_code_b64, 'base64');
        doc.image(qrPng, pageW - 140, pageH - 160, { width: 80, height: 80 });
      } catch (e) { /* ignore */ }

      doc.moveTo(100, 430).lineTo(280, 430).lineWidth(1).strokeColor('#9ca3af').stroke();
      doc.moveTo(pageW - 280, 430).lineTo(pageW - 100, 430).stroke();
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#1f2937').text(cert.issuer_name, 100, 440, { width: 180, align: 'center' });
      doc.text('Authorized Signatory', pageW - 280, 440, { width: 180, align: 'center' });
      doc.font('Helvetica').fontSize(10).fillColor('#6b7280').text(cert.issuer_title, 100, 455, { width: 180, align: 'center' });
      doc.text('CampusCertSystem Verified', pageW - 280, 455, { width: 180, align: 'center' });
    }

    doc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/analytics', async (req, res) => {
  try {
    const totalCerts = await certificatesCol.countDocuments();
    const totalEvents = await eventsCol.countDocuments();
    const totalTemplates = await templatesCol.countDocuments();
    const revokedCerts = await certificatesCol.countDocuments({ status: 'Revoked' });
    const activeCerts = totalCerts - revokedCerts;

    const pipeline = [
      { $group: { _id: '$event_category', count: { $sum: 1 } } }
    ];
    const categoryStats = await certificatesCol.aggregate(pipeline).toArray();

    res.json({
      total_certificates: totalCerts,
      active_certificates: activeCerts,
      revoked_certificates: revokedCerts,
      total_events: totalEvents,
      total_templates: totalTemplates,
      category_breakdown: categoryStats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Node.js Express backend server running on port ${PORT}`);
});
