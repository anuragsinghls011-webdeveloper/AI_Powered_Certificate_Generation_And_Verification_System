const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeAuthIndexes } = require('../services/authIndexes');

test('auth indexes are awaited after connection and include unique identity keys', async () => {
  const calls = [];
  const db = { collection: name => ({
    createIndex: async (keys, options) => { calls.push({ name, keys, options }); }
  }) };
  await initializeAuthIndexes(db);
  assert.equal(calls.length, 14);
  assert.ok(calls.some(call => call.name === 'users' && call.keys.email === 1 && call.options.unique));
  assert.ok(calls.some(call => call.name === 'registration_otps' && call.keys.email === 1 && call.options.unique));
  assert.ok(calls.some(call => call.name === 'organization_memberships' && call.keys.organization_id === 1 && call.options.unique));
});

test('index creation failure reaches startup instead of being silently ignored', async () => {
  const db = { collection: () => ({ createIndex: async () => { throw new Error('duplicate data'); } }) };
  await assert.rejects(initializeAuthIndexes(db), /duplicate data/);
});
