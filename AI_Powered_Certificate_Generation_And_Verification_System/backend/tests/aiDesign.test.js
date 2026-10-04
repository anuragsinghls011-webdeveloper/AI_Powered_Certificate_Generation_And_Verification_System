const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateResponse } = require('../services/ai/aiSchema');
const { parseRequest, compactTemplate } = require('../services/ai/aiDesignService');
const { design } = require('../services/ai/aiDesignService');

const base = { id: null, name: 'Current design', fields: [
  { id: 'recipient-1', type: 'recipient_name', x: 96, y: 200, width: 600, height: 40, fontSize: 32, textAlign: 'center' }
] };
const proposal = fields => ({ intent: 'modify', summary: 'Updated the certificate', template_changes: {}, field_operations: fields });

test('authenticated-context payload retains only design metadata, never ownership or embedded images', () => {
  const clean = compactTemplate({ ...base, organization_id: 'other-tenant', background_image: 'data:image/png;base64,PRIVATE',
    fields: [{ ...base.fields[0], image: 'data:image/png;base64,PRIVATE' }] });
  assert.equal(clean.organization_id, undefined);
  assert.equal(clean.background_image, undefined);
  assert.equal(clean.fields[0].image, undefined);
  assert.equal(parseRequest({ prompt: 'Make name larger', template: clean, conversation: [] }).prompt, 'Make name larger');
});

test('one-field edit keeps the rest of the template and clamps small boundary overflow', () => {
  const result = validateResponse(proposal([
    { type: 'update_field', field_type: 'recipient_name', properties: { fontSize: 42, y: 215 } },
    { type: 'add_field', field_type: 'certificate_qr', properties: { x: 750, y: 490, width: 90, height: 90 } }
  ]), base);
  assert.equal(result.field_operations[0].properties.fontSize, 42);
  assert.equal(result.field_operations[1].properties.x, 670);
  assert.equal(result.field_operations[1].properties.y, 438);
  assert.equal(result.field_operations[1].properties.width, 90);
});

test('invalid geometry, unknown fields, unsafe image URLs and absurd typography reject the entire proposal', () => {
  const op = props => proposal([{ type: 'add_field', field_type: 'certificate_qr', properties: props }]);
  assert.throws(() => validateResponse(op({ x: -9, y: 30, width: 80 }), base), /Invalid/);
  assert.throws(() => validateResponse(op({ x: 99999, y: 30, width: 80 }), base), /Invalid/);
  assert.throws(() => validateResponse(op({ x: 300, y: 400, width: Number.NaN }), base), /Invalid/);
  assert.throws(() => validateResponse(op({ x: 300, y: 400, width: 80, image: 'https://bad.invalid/a.png' }), base), /Unsupported/);
  assert.throws(() => validateResponse(proposal([{ type: 'add_field', field_type: 'hologram', properties: {} }]), base), /Unsupported/);
  assert.throws(() => validateResponse(proposal([{ type: 'update_field', field_type: 'recipient_name', properties: { fontSize: 800 } }]), base), /Invalid/);
  assert.throws(() => validateResponse(proposal([{ type: 'remove_field', field_type: 'rank', properties: {} }]), base), /not found/);
});

test('blank prompt, oversized prompt and overlong conversation are refused before provider calls', () => {
  assert.throws(() => parseRequest({ prompt: ' ', template: base }), /Describe/);
  assert.throws(() => parseRequest({ prompt: 'x'.repeat(1201), template: base }), /Describe/);
  assert.throws(() => parseRequest({ prompt: 'Hello', template: base,
    conversation: Array(9).fill({ role: 'assistant', content: 'Previous design' }) }), /too long/);
});

test('pale accent text is adjusted on white backgrounds without altering the border palette', () => {
  const result = validateResponse(proposal([{ type: 'add_field', field_type: 'rank',
    properties: { x: 96, y: 300, width: 600, color: '#eab308', fontSize: 14 } }]), base);
  assert.notEqual(result.field_operations[0].properties.color, '#eab308');
  assert.equal(result.warnings.length, 1);
  assert.equal(base.fields.length, 1);
});

test('empty logo and signature images never reach a live canvas or PDF preview', () => {
  const result = validateResponse(proposal([
    { type: 'add_field', field_type: 'logo_image', properties: { x: 320, y: 450, width: 120, height: 50 } },
    { type: 'add_field', field_type: 'signature_image', properties: { x: 96, y: 450, width: 120, height: 50 } }
  ]), base);
  assert.equal(result.field_operations.length, 0);
  assert.equal(result.warnings.length, 2);
});

test('three alternatives are independently validated; any invalid variant rejects all', () => {
  const variant = { name: 'Minimal', design: proposal([{ type: 'update_field', field_type: 'recipient_name', properties: { fontSize: 36 } }]) };
  const good = { intent: 'variation', summary: 'Three alternatives', variants: [variant, { ...variant, name: 'Luxury' }, { ...variant, name: 'Modern' }] };
  assert.equal(validateResponse(good, base).variants.length, 3);
  const wrapped = { summary: 'Variations', variants: [
    { name: 'Minimal', design: { template_changes: {}, field_operations: variant.design.field_operations } },
    { name: 'Luxury', template_changes: {}, field_operations: variant.design.field_operations },
    { name: 'Modern', design: { template_changes: {}, field_operations: variant.design.field_operations } }
  ] };
  assert.equal(validateResponse(wrapped, base).variants[1].design.intent, 'style');
  assert.throws(() => validateResponse({ ...good, variants: [...good.variants.slice(0, 2),
    { name: 'Bad', design: proposal([{ type: 'add_field', field_type: 'unsupported', properties: {} }]) }] }, base), /Unsupported/);
});

test('malformed provider responses are refused even after one guarded correction attempt', async () => {
  let calls = 0;
  await assert.rejects(design({ body: { prompt: 'Create a certificate', template: base },
    provider: async () => { calls++; return proposal([{ type: 'add_field', field_type: 'hologram', properties: {} }]); } }), /Unsupported/);
  assert.equal(calls, 2);
});

test('provider errors do not generate a partial design', async () => {
  await assert.rejects(design({ body: { prompt: 'Create a certificate', template: base },
    provider: async () => { throw new Error('unavailable'); } }), /unavailable/);
});