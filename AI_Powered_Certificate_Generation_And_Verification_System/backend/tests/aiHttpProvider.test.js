const { test } = require('node:test');
const assert = require('node:assert/strict');
const { requestDesign, configuredProvider } = require('../services/ai/aiHttpProvider');

test('Gemini prompt and sketch requests send the expected content and parse JSON', async () => {
  const originalKey = process.env.GEMINI_API_KEY;
  const originalProvider = process.env.AI_PROVIDER;
  const originalFetch = global.fetch;
  try {
    process.env.AI_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'test-key';
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"intent":"create","summary":"Ready"}' }] } }] }) };
    };
    assert.equal(configuredProvider(), 'gemini');
    assert.equal((await requestDesign({ system: 'rules', user: 'make a certificate' })).summary, 'Ready');
    assert.equal((await requestDesign({ system: 'rules', user: 'follow this sketch', sketchBase64: 'abc', sketchMime: 'image/png' })).summary, 'Ready');
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].body.contents[0].parts, [{ text: 'make a certificate' }]);
    assert.deepEqual(calls[1].body.contents[0].parts[1], { inlineData: { mimeType: 'image/png', data: 'abc' } });
    assert.equal(calls[0].options.headers['x-goog-api-key'], 'test-key');
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
    if (originalProvider === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = originalProvider;
  }
});

test('HTTP provider does not silently substitute a template when the model fails', async () => {
  const originalKey = process.env.GEMINI_API_KEY;
  const originalFetch = global.fetch;
  try {
    process.env.GEMINI_API_KEY = 'test-key';
    global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: { status: 'UNAUTHENTICATED' } }) });
    await assert.rejects(requestDesign({ system: 'rules', user: 'certificate' }), { code: 'AI_KEY_REJECTED' });
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
  }
});

test('Gemini default model falls back on 404 and retries a temporary outage', async () => {
  const original = { key: process.env.GEMINI_API_KEY, model: process.env.AI_MODEL, provider: process.env.AI_PROVIDER, fetch: global.fetch };
  try {
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.AI_MODEL;
    process.env.AI_PROVIDER = 'gemini';
    const urls = [];
    global.fetch = async url => {
      urls.push(url);
      if (urls.length === 1) return { ok: false, status: 404, json: async () => ({ error: { status: 'NOT_FOUND' } }) };
      if (urls.length === 2) return { ok: false, status: 503, json: async () => ({ error: { status: 'UNAVAILABLE' } }) };
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"summary":"Recovered"}' }] } }] }) };
    };
    assert.equal((await requestDesign({ system: 'rules', user: 'certificate' })).summary, 'Recovered');
    assert.match(urls[0], /gemini-3\.1-flash-lite/);
    assert.match(urls[1], /gemini-flash-latest/);
    assert.equal(urls[1], urls[2]);
  } finally {
    global.fetch = original.fetch;
    for (const [name, value] of [['GEMINI_API_KEY', original.key], ['AI_MODEL', original.model], ['AI_PROVIDER', original.provider]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test('Gemini quota error stays actionable after an API key is configured', async () => {
  const original = { key: process.env.GEMINI_API_KEY, provider: process.env.AI_PROVIDER, fetch: global.fetch };
  try {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.AI_PROVIDER = 'gemini';
    global.fetch = async () => ({ ok: false, status: 429, json: async () => ({ error: { status: 'RESOURCE_EXHAUSTED' } }) });
    await assert.rejects(requestDesign({ system: 'rules', user: 'certificate' }), { code: 'AI_QUOTA_EXCEEDED', httpStatus: 429 });
  } finally {
    global.fetch = original.fetch;
    for (const [name, value] of [['GEMINI_API_KEY', original.key], ['AI_PROVIDER', original.provider]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test('explicit OpenAI selection sends a vision image and parses its response', async () => {
  const original = { provider: process.env.AI_PROVIDER, key: process.env.OPENAI_API_KEY, gemini: process.env.GEMINI_API_KEY, fetch: global.fetch };
  try {
    process.env.AI_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    let request;
    global.fetch = async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"summary":"Vision ready"}' } }] }) };
    };
    assert.equal(configuredProvider(), 'openai');
    const output = await requestDesign({ system: 'rules', user: 'follow sketch', sketchBase64: 'abc', sketchMime: 'image/jpeg' });
    assert.equal(output.summary, 'Vision ready');
    assert.match(request.url, /api\.openai\.com/);
    assert.equal(request.body.messages[1].content[1].image_url.url, 'data:image/jpeg;base64,abc');
  } finally {
    global.fetch = original.fetch;
    for (const [name, value] of [['AI_PROVIDER', original.provider], ['OPENAI_API_KEY', original.key], ['GEMINI_API_KEY', original.gemini]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
