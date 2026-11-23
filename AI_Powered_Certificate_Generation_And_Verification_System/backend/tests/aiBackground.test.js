const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateBackground } = require('../services/ai/aiImageService');
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function geminiFixture(t, response) {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'fixture';
  t.after(() => {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  });
  return t.mock.method(global, 'fetch', async () => response);
}

test('Frames sends the prompt to Gemini and returns its final image to Studio', async t => {
  const fetch = geminiFixture(t, { ok: true, json: async () => ({ candidates: [{ content: { parts: [
    { thought: true, inlineData: { data: 'draft', mimeType: 'image/png' } },
    { inlineData: { data: png, mimeType: 'image/png' } }
  ] } }] }) });
  const result = await generateBackground({ prompt: 'Navy and gold' });
  const [url, request] = fetch.mock.calls[0].arguments;
  assert.match(url, /^https:\/\/generativelanguage\.googleapis\.com\/.+:generateContent$/);
  assert.equal(request.headers['x-goog-api-key'], 'fixture');
  assert.match(JSON.parse(request.body).contents[0].parts[0].text, /Navy and gold/);
  assert.deepEqual(result, { success: true, provider: 'gemini', image: 'data:image/png;base64,' + png });
});

test('Frames exposes a quota error without an image or provider secrets', async t => {
  geminiFixture(t, { ok: false, status: 429, json: async () => ({}) });
  await assert.rejects(generateBackground({ prompt: 'Classic' }), { code: 'AI_QUOTA_EXCEEDED', httpStatus: 429 });
});

test('An empty Gemini candidate does not become an applicable frame', async t => {
  geminiFixture(t, { ok: true, json: async () => ({ candidates: [] }) });
  await assert.rejects(generateBackground({ prompt: 'Classic' }), { code: 'AI_NO_IMAGE' });
});

test('A limited image model falls back to a Gemini-designed border with space for text', async t => {
  const plan = {
    paper: '#ffffff', ink: '#163c59', accent: '#ee9900',
    borders: [{ inset: 15, weight: 2, color: 'ink' }],
    corner: [{ points: [[20, 50], [20, 20], [50, 20]], weight: 2, color: 'accent' }]
  };
  const fetch = geminiFixture(t, { ok: true, json: async () => ({
    candidates: [{ content: { parts: [{ text: JSON.stringify(plan) }] } }]
  }) });
  fetch.mock.mockImplementationOnce(async () => ({ ok: false, status: 429 }));
  const result = await generateBackground({ prompt: 'Navy and gold' });
  assert.equal(result.provider, 'gemini-drawn');
  const png = require('pngjs').PNG.sync.read(Buffer.from(result.image.split(',')[1], 'base64'));
  assert.deepEqual([png.width, png.height], [1200, 850]);
  const pixel = (x, y) => png.data.readUInt32BE(4 * (y * png.width + x));
  assert.equal(pixel(600, 425), 0xffffffff);
  assert.equal(pixel(600, 15), 0x163c59ff);
  assert.equal(pixel(20, 30), 0xee9900ff);
});
