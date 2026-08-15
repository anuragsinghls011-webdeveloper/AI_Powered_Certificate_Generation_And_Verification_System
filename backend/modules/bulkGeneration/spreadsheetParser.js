// Safe CSV / XLSX parser. Formulas are never evaluated.
const fs = require('fs');
const XLSX = require('xlsx');
const { parse: parseCsvSync } = require('csv-parse/sync');

const CSV_INJECTION_PREFIX = /^[=+\-@\t\r]/;

function sanitizeCell(v) {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'string' ? v : String(v);
  // Neutralise CSV / spreadsheet injection payloads
  if (CSV_INJECTION_PREFIX.test(s)) s = "'" + s;
  // Strip control chars except tab / newline
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  // Cap absurdly long values
  if (s.length > 500) s = s.slice(0, 500);
  return s.trim();
}

function normaliseHeaders(rawHeaders) {
  const seen = {};
  return rawHeaders.map((h, i) => {
    let name = (h == null ? '' : String(h)).trim() || `column_${i + 1}`;
    // De-duplicate collisions
    if (seen[name]) {
      seen[name] += 1;
      name = `${name} (${seen[name]})`;
    } else {
      seen[name] = 1;
    }
    return name;
  });
}

function parseCsvBuffer(buf) {
  const records = parseCsvSync(buf, {
    bom: true,
    columns: false,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true
  });
  if (records.length === 0) return { headers: [], rows: [] };
  const headers = normaliseHeaders(records[0]);
  const rows = records.slice(1).map((r) => headers.reduce((acc, h, i) => {
    acc[h] = sanitizeCell(r[i]);
    return acc;
  }, {}));
  return { headers, rows };
}

function parseXlsxBuffer(buf) {
  // { cellFormula: false } prevents formula evaluation
  const wb = XLSX.read(buf, { type: 'buffer', cellFormula: false, cellDates: true, cellText: false });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) return { headers: [], rows: [] };
  const sheet = wb.Sheets[firstSheet];
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, blankrows: false });
  if (aoa.length === 0) return { headers: [], rows: [] };
  const headers = normaliseHeaders(aoa[0]);
  const rows = aoa.slice(1).map((r) => headers.reduce((acc, h, i) => {
    acc[h] = sanitizeCell(r[i]);
    return acc;
  }, {}));
  return { headers, rows };
}

function parseFile(filePath, originalName) {
  const ext = (originalName || filePath).toLowerCase().split('.').pop();
  const buf = fs.readFileSync(filePath);
  if (ext === 'csv') return parseCsvBuffer(buf);
  if (ext === 'xlsx' || ext === 'xls') return parseXlsxBuffer(buf);
  throw new Error(`Unsupported file extension: .${ext}`);
}

module.exports = { parseFile, parseCsvBuffer, parseXlsxBuffer, sanitizeCell };
