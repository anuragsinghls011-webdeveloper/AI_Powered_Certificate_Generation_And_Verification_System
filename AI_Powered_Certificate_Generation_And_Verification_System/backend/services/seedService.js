const { getEventsCol, getTemplatesCol } = require('../config/db');

/**
 * Seeds initial template and event data if collections are empty.
 * Called once on server startup after DB connection.
 */
async function seedInitialData() {
  const templatesCol = getTemplatesCol();
  const eventsCol = getEventsCol();

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

module.exports = { seedInitialData };
