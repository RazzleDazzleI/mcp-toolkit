import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toolError, ok, ErrorCode } from '../patterns/errors.js';
import { createIdempotencyCache } from '../patterns/idempotency.js';

test('toolError marks isError and encodes a parseable payload', () => {
  const r = toolError(ErrorCode.NOT_FOUND, 'no file', { hint: 'call list_files' });
  assert.equal(r.isError, true);
  const body = JSON.parse(r.content[0].text);
  assert.equal(body.error, 'not_found');
  assert.equal(body.hint, 'call list_files');
});

test('ok passes strings through and serialises objects', () => {
  assert.equal(ok('plain').content[0].text, 'plain');
  assert.equal(JSON.parse(ok({ a: 1 }).content[0].text).a, 1);
});

test('idempotency cache replays the first result for a repeated key', async () => {
  const cache = createIdempotencyCache();
  let calls = 0;
  const run = async () => { calls++; return { calls }; };

  const a = await cache.once('k1', run);
  const b = await cache.once('k1', run);
  assert.equal(calls, 1, 'second call with same key must not re-run');
  assert.deepEqual(a, b);
});

test('idempotency cache does not dedup when no key is supplied', async () => {
  const cache = createIdempotencyCache();
  let calls = 0;
  const run = async () => { calls++; return calls; };
  await cache.once(undefined, run);
  await cache.once(undefined, run);
  assert.equal(calls, 2);
});

test('idempotency cache stays bounded', async () => {
  const cache = createIdempotencyCache({ max: 3 });
  for (let i = 0; i < 10; i++) await cache.once(`k${i}`, async () => i);
  assert.ok(cache.size() <= 4, `expected bounded cache, got ${cache.size()}`);
});
