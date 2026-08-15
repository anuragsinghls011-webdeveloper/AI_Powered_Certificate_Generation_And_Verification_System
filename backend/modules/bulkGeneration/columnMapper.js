// Suggests mappings between spreadsheet columns and certificate field types
// used both by the Design Studio templates and the bulk generator.

const norm = (s) => (s || '')
  .toLowerCase()
  .replace(/[_\-\s]+/g, '')
  .replace(/[^a-z0-9]/g, '');

// Semantic buckets → weighted aliases
const FIELD_ALIASES = {
  recipient_name: ['name', 'fullname', 'participantname', 'studentname', 'recipient', 'recipientname', 'attendee', 'candidate', 'awardee', 'employee', 'person'],
  email: ['email', 'emailaddress', 'emailid', 'mail', 'mailid', 'contactemail'],
  event_title: ['event', 'eventname', 'course', 'coursename', 'program', 'programme', 'workshop', 'training', 'seminar', 'activity'],
  issue_date: ['date', 'issuedate', 'completiondate', 'completedon', 'awardeddate', 'certdate', 'certificatedate'],
  organization_name: ['organization', 'organisation', 'institution', 'university', 'college', 'company', 'department', 'dept'],
  rank: ['rank', 'position', 'role', 'grade', 'category', 'placement', 'award', 'result'],
  certificate_id: ['id', 'certid', 'certificateid', 'serial', 'serialno', 'certificateno', 'certificatenumber', 'studentid', 'employeeid', 'rollno', 'rollnumber'],
  score: ['score', 'marks', 'percentage', 'result', 'grade', 'gpa'],
  certificate_link: ['link', 'url', 'verificationlink', 'verifyurl', 'certurl'],
};

const REQUIRED = new Set(['recipient_name']);

function suggestMappings(headers, templateFields) {
  // Which certificate field types are needed by the chosen template?
  const templateTypes = new Set((templateFields || []).map(f => f.type).filter(Boolean));
  // Always include recipient_name so we can generate meaningful certs
  templateTypes.add('recipient_name');
  templateTypes.add('email'); // for delivery

  const suggestions = {};
  for (const header of headers) {
    const nh = norm(header);
    let best = null;
    let bestScore = 0;
    for (const [fieldType, aliases] of Object.entries(FIELD_ALIASES)) {
      for (const alias of aliases) {
        let score = 0;
        if (nh === alias) score = 100;
        else if (nh.includes(alias) || alias.includes(nh)) score = 60;
        if (score > bestScore) {
          bestScore = score;
          best = fieldType;
        }
      }
    }
    if (best && bestScore >= 60) {
      suggestions[header] = { fieldType: best, confidence: bestScore, isTemplateField: templateTypes.has(best) };
    } else {
      suggestions[header] = { fieldType: null, confidence: 0, isTemplateField: false };
    }
  }

  // required field satisfaction
  const mapped = new Set(Object.values(suggestions).map(s => s.fieldType).filter(Boolean));
  const unresolvedRequired = [...REQUIRED].filter(r => !mapped.has(r));

  return { suggestions, unresolvedRequired, requiredFields: [...REQUIRED] };
}

module.exports = { suggestMappings, FIELD_ALIASES, REQUIRED, norm };
