const MAX_REPORT_ROWS = require('../config/security').reportRows;
const MAX_METADATA_COLUMNS = 128;
const BASE_HEADERS = ['Certificate ID', 'Event Name', 'Event Date', 'Recipient Name', 'Recipient Email', 'Issue Date', 'Status', 'Role', 'Grade'];

function summarize(records) {
  const result = { total: 0, active: 0, revoked: 0, other: 0 };
  for (const record of records) {
    const count = record.count ?? 1;
    const status = typeof record.status === 'string' ? record.status.trim().toLowerCase() : '';
    result.total += count;
    result[status === 'active' || status === 'revoked' ? status : 'other'] += count;
  }
  return result;
}

function reportFilename(title, format) {
  const slug = String(title || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100).replace(/-$/, '');
  return `event-report-${slug || 'event'}.${format}`;
}

function text(value) {
  if (value == null) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function cell(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value;
  let result = text(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  // Protect CSV opened in Excel, including formulas hidden behind whitespace.
  if (/^[\s]*[=+@-]/.test(result) || /^[\t\r\n]/.test(result)) result = `'${result}`;
  if (result.length > 32767) {
    const error = new Error('A report field exceeds the spreadsheet limit of 32,767 characters. Shorten the field and try again.');
    error.status = 422;
    throw error;
  }
  return result;
}

function dateText(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) return text(value);
  // ISO date-only strings stay date-only; timestamps retain their timezone.
  return text(value);
}

function flattenMetadata(value, path = '', result = new Map(), depth = 0) {
  if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && depth < 8 && Object.keys(value).length) {
    for (const [key, child] of Object.entries(value)) {
      // Escaped path segments prevent a.b and nested a → b from colliding.
      const segment = key.replace(/~/g, '~0').replace(/\//g, '~1');
      flattenMetadata(child, path ? `${path}/${segment}` : segment, result, depth + 1);
    }
  } else if (path) result.set(path, value);
  return result;
}

function buildReport({ event, certificates, format }) {
  const XLSX = require('xlsx');
  const fields = new Set();
  for (const cert of certificates) {
    for (const key of flattenMetadata(cert.metadata).keys()) {
      if (fields.size < MAX_METADATA_COLUMNS) fields.add(key);
    }
  }
  const metadataKeys = [...fields].sort();
  const headers = [...BASE_HEADERS, ...metadataKeys.map(key => `Metadata: ${key}`), 'Metadata'];
  const sheet = XLSX.utils.aoa_to_sheet([headers.map(cell)]);
  // Append incrementally instead of building a second complete row matrix.
  for (const cert of certificates) {
    const metadata = flattenMetadata(cert.metadata);
    const extra = Object.fromEntries([...metadata].filter(([key]) => !fields.has(key)));
    const remainder = metadata.size ? (Object.keys(extra).length ? extra : '') : cert.metadata;
    const row = [cert.cert_id, event.title, dateText(event.date), cert.recipient_name, cert.recipient_email,
      dateText(cert.issue_date), cert.status, cert.role, cert.grade,
      ...metadataKeys.map(key => metadata.get(key)), remainder];
    XLSX.utils.sheet_add_aoa(sheet, [row.map(cell)], { origin: -1 });
  }
  sheet['!cols'] = headers.map((header, i) => ({ wch: i === 1 || i === 4 ? 36 : Math.min(48, Math.max(20, header.length + 2)) }));
  sheet['!autofilter'] = { ref: sheet['!ref'] };
  if (format === 'csv') {
    return Buffer.from(`\uFEFF${XLSX.utils.sheet_to_csv(sheet, { FS: ',', RS: '\r\n', forceQuotes: true, blankrows: false })}`, 'utf8');
  }
  const stats = summarize(certificates);
  const summary = XLSX.utils.aoa_to_sheet([
    ['Event Report'], [], ['Event Name', cell(event.title)], ['Event Date', cell(dateText(event.date))],
    ['Total Certificates', stats.total], ['Active Certificates', stats.active],
    ['Revoked Certificates', stats.revoked], ['Other / Unknown Status', stats.other],
    ['Report Generated At (UTC)', new Date().toISOString()]
  ]);
  summary['!cols'] = [{ wch: 30 }, { wch: 60 }];
  summary['!merges'] = [XLSX.utils.decode_range('A1:B1')];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, summary, 'Event Summary');
  XLSX.utils.book_append_sheet(workbook, sheet, 'Certificate Details');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true });
}

module.exports = { buildReport, summarize, reportFilename, MAX_REPORT_ROWS };