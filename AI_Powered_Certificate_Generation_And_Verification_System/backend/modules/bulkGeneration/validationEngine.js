// Row-level validator. Returns per-row errors + duplicate + summary counts.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// mapping = { spreadsheetHeader: fieldType }  (fieldType may be null/undefined = ignore)
function invertMapping(mapping) {
  // fieldType -> header (last wins if user duplicated — UI prevents this)
  const inv = {};
  for (const [header, spec] of Object.entries(mapping || {})) {
    const type = typeof spec === 'string' ? spec : spec?.fieldType;
    if (type) inv[type] = header;
  }
  return inv;
}

function resolveValue(row, header, defaults, fieldType) {
  if (header && row[header] != null && String(row[header]).trim() !== '') {
    return String(row[header]).trim();
  }
  if (defaults && defaults[fieldType]) return String(defaults[fieldType]);
  return '';
}

function validateRows(rows, mapping, requiredFieldTypes = ['recipient_name'], defaults = {}) {
  const inv = invertMapping(mapping);
  const seen = new Map(); // dedupe key -> firstRowIndex
  const validated = [];

  let valid = 0, invalid = 0, duplicate = 0, warnings = 0;

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2; // account for header
    const errors = [];
    const warns = [];

    // Required fields
    for (const rt of requiredFieldTypes) {
      const val = resolveValue(row, inv[rt], defaults, rt);
      if (!val) {
        errors.push({ field: rt, code: 'REQUIRED_MISSING', message: `${rt} is required` });
      }
    }

    // Email format
    if (inv.email) {
      const emailVal = String(row[inv.email] || '').trim();
      if (emailVal && !EMAIL_RE.test(emailVal)) {
        errors.push({ field: 'email', code: 'INVALID_EMAIL', message: `Invalid email format: ${emailVal}` });
      } else if (!emailVal) {
        warns.push({ field: 'email', code: 'EMAIL_MISSING', message: 'Email missing — certificate will not be emailed' });
      }
    }

    // Duplicate detection key: recipient_name + email + event_title
    const nameVal = resolveValue(row, inv.recipient_name, defaults, 'recipient_name').toLowerCase();
    const emailVal = resolveValue(row, inv.email, defaults, 'email').toLowerCase();
    const eventVal = resolveValue(row, inv.event_title, defaults, 'event_title').toLowerCase();
    const dupKey = `${nameVal}|${emailVal}|${eventVal}`;
    let isDuplicate = false;
    if (nameVal && seen.has(dupKey)) {
      isDuplicate = true;
      errors.push({ field: 'row', code: 'DUPLICATE', message: `Duplicate of row ${seen.get(dupKey)}` });
    } else if (nameVal) {
      seen.set(dupKey, rowNumber);
    }

    if (errors.length === 0) valid++;
    else if (isDuplicate) duplicate++;
    else invalid++;
    if (warns.length > 0) warnings++;

    validated.push({
      rowNumber,
      row,
      errors,
      warnings: warns,
      status: errors.length === 0 ? (warns.length ? 'valid_with_warnings' : 'valid') : (isDuplicate ? 'duplicate' : 'invalid')
    });
  });

  return {
    validated,
    summary: {
      total: rows.length,
      valid,
      invalid,
      duplicate,
      warnings
    }
  };
}

module.exports = { validateRows, invertMapping };
