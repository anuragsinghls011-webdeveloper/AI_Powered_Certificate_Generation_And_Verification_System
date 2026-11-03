const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateBackground } = require('../services/ai/aiImageService');

test('generateBackground: generates a valid base64 certificate background image', async () => {
  const result = await generateBackground({
    prompt: 'Luxury gold foil ornate certificate border',
    style: 'luxury'
  });

  assert.equal(result.success, true);
  assert.ok(result.image.startsWith('data:image/png;base64,'));
  assert.ok(result.image.length > 500);
  assert.ok(result.provider);
});

test('generateBackground: generates academic diploma style background', async () => {
  const result = await generateBackground({
    prompt: 'Prestigious academic university diploma frame with navy and gold accents',
    style: 'academic'
  });

  assert.equal(result.success, true);
  assert.ok(result.image.startsWith('data:image/png;base64,'));
});
