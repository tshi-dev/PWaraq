// A run that ends normally, or is only hidden (a background tab the browser may discard), must not be reported as
// "closed without a clean exit" at the next start.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map(), on = {};
const listen = (type, f) => (on[type] ??= []).push(f), fire = (type, e = {}) => on[type]?.forEach((f) => f(e));
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
globalThis.addEventListener = listen;
globalThis.document = { visibilityState: 'visible', addEventListener: listen };
const { startSession, endSession } = await import('../../src/lib/session.ts');
const list = () => JSON.parse(store.get('waraq-sessions'));
const show = (state) => { document.visibilityState = state; fire('visibilitychange'); };

test('an id left in the list without its lock is an unclean run; endSession takes this run out', async () => {
  store.set('waraq-sessions', JSON.stringify(['gone']));
  assert.equal(await startSession(), true); // "gone" holds no lock: it crashed
  assert.equal(list().length, 1);
  await endSession();
  assert.deepEqual(list(), []);
  show('hidden'); show('visible');
  assert.deepEqual(list(), []); // an ended run does not rejoin
  assert.equal(await startSession(), false); // the run that ended normally is not reported
});

test('hidden = out of the list, shown again or back from the page cache = in again', async () => {
  const mine = list()[0];
  show('hidden');
  assert.deepEqual(list(), []); // a tab discarded now is not a crash
  show('visible');
  assert.deepEqual(list(), [mine]);
  fire('pagehide'); assert.deepEqual(list(), []);
  fire('pageshow', { persisted: true }); assert.deepEqual(list(), [mine]);
  await endSession();
});
