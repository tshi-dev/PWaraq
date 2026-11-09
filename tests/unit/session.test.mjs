// A run that ends normally must not be reported as "closed without a clean exit" at the next start.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
globalThis.addEventListener ??= () => {};
const { startSession, endSession } = await import('../../src/lib/session.ts');
const list = () => JSON.parse(store.get('waraq-sessions'));

test('an id left in the list without its lock is an unclean run; endSession takes this run out', async () => {
  store.set('waraq-sessions', JSON.stringify(['gone']));
  assert.equal(await startSession(), true); // "gone" holds no lock: it crashed
  assert.equal(list().length, 1);
  await endSession();
  assert.deepEqual(list(), []);
  assert.equal(await startSession(), false); // the run that ended normally is not reported
  await endSession();
});
