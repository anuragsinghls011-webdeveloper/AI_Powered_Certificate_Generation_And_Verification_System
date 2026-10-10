const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseSketchRequest, designFromSketch } = require('../services/ai/aiSketchService');
const { DesignValidationError } = require('../services/ai/aiSchema');

const validBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('parseSketchRequest: valid file upload passes', () => {
  const file = {
    mimetype: 'image/png',
    size: 1024,
    buffer: Buffer.from('dummy-image-data')
  };
  const result = parseSketchRequest({ prompt: 'Create modern certificate' }, file);
  assert.equal(result.prompt, 'Create modern certificate');
  assert.equal(result.sketchMime, 'image/png');
  assert.ok(result.sketchBase64);
});

test('parseSketchRequest: valid base64 payload passes', () => {
  const result = parseSketchRequest({
    prompt: 'Create classic certificate',
    sketch_base64: validBase64,
    sketch_mime: 'image/jpeg'
  });
  assert.equal(result.prompt, 'Create classic certificate');
  assert.equal(result.sketchMime, 'image/jpeg');
  assert.equal(result.sketchBase64, validBase64);
});

test('parseSketchRequest: rejects missing prompt', () => {
  assert.throws(() => parseSketchRequest({ prompt: '' }, { mimetype: 'image/png', size: 10, buffer: Buffer.from('x') }),
    /Describe your desired design style/);
});

test('parseSketchRequest: rejects oversized prompt (>1200 chars)', () => {
  assert.throws(() => parseSketchRequest({ prompt: 'a'.repeat(1201), sketch_base64: validBase64 }),
    /under 1,200 characters/);
});

test('parseSketchRequest: rejects missing sketch', () => {
  assert.throws(() => parseSketchRequest({ prompt: 'Create certificate' }),
    /Upload a sketch image/);
});

test('parseSketchRequest: rejects invalid mime type', () => {
  const file = { mimetype: 'application/pdf', size: 10, buffer: Buffer.from('x') };
  assert.throws(() => parseSketchRequest({ prompt: 'test' }, file),
    /Only PNG, JPEG, and WebP/);
});

test('parseSketchRequest: rejects file over 4MB', () => {
  const file = { mimetype: 'image/png', size: 5 * 1024 * 1024, buffer: Buffer.alloc(100) };
  assert.throws(() => parseSketchRequest({ prompt: 'test' }, file),
    /under 4MB/);
});

test('designFromSketch: successfully executes provider and validates output', async () => {
  const mockProvider = async () => ({
    intent: 'create',
    summary: 'Created template from sketch',
    template_changes: {
      name: 'Award Certificate',
      style: 'modern',
      category: 'Award',
      primary_color: '#1e3a8a',
      secondary_color: '#d97706',
      background_color: '#ffffff',
      border_style: 'solid',
      border_width: 4
    },
    field_operations: [
      {
        type: 'add_field',
        field_type: 'recipient_name',
        properties: { x: 96, y: 200, width: 600, height: 44, fontSize: 36, textAlign: 'center', color: '#1e3a8a' }
      },
      {
        type: 'add_field',
        field_type: 'certificate_qr',
        properties: { x: 648, y: 420, width: 84, height: 84 }
      }
    ],
    design_notes: ['Sketch layout mapped successfully'],
    warnings: [],
    replace_existing_fields: true
  });

  const proposal = await designFromSketch({
    body: { prompt: 'Make modern blue and gold', sketch_base64: validBase64, sketch_mime: 'image/png' },
    provider: mockProvider
  });

  assert.equal(proposal.intent, 'create');
  assert.equal(proposal.replace_existing_fields, true);
  assert.equal(proposal.field_operations.length, 2);
  assert.equal(proposal.template_changes.primary_color, '#1e3a8a');
});

test('designFromSketch: retries once on invalid model output before throwing', async () => {
  let callCount = 0;
  const failingProvider = async () => {
    callCount++;
    return {
      intent: 'create',
      summary: 'Bad output',
      template_changes: {},
      field_operations: [
        { type: 'add_field', field_type: 'unsupported_field', properties: {} }
      ],
      replace_existing_fields: true
    };
  };

  await assert.rejects(
    designFromSketch({
      body: { prompt: 'Make certificate', sketch_base64: validBase64 },
      provider: failingProvider
    }),
    /Unsupported field operation/
  );

  assert.equal(callCount, 2); // Retried once
});

test('designFromSketch: executes real sketchBridge.py locally and produces valid template', async () => {
  const proposal = await designFromSketch({
    body: {
      prompt: 'Create a luxurious gold award certificate with serif fonts',
      sketch_base64: validBase64,
      sketch_mime: 'image/png'
    }
  });

  assert.equal(proposal.intent, 'create');
  assert.equal(proposal.replace_existing_fields, true);
  assert.ok(proposal.field_operations.length >= 8);
  assert.ok(proposal.summary);
  assert.equal(proposal.template_changes.style, 'classic');
  assert.equal(proposal.template_changes.primary_color, '#1c1917');
  assert.equal(proposal.template_changes.secondary_color, '#d97706');
});
