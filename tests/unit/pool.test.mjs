// The engine pool with stand-in workers: a WebAssembly abort during open restarts that worker, an engine that keeps
// crashing is stopped (no endless restarts), and a file too big for every worker's copy opens in fewer workers.
import { test } from 'node:test';
import assert from 'node:assert/strict';

let answer = () => ({ result: true }), spawned = 0;
globalThis.Worker = class {
  constructor() { spawned++; }
  postMessage(m) { setTimeout(() => { const a = answer(m); this.onmessage?.({ data: { id: m.id, ...a } }); }); }
  terminate() {}
};
const { EnginePool, workersFor } = await import('../../src/lib/engine/pool.ts');
const tick = () => new Promise((r) => setTimeout(r, 20));
const opened = (m) => (m.op === 'open' ? { result: { sizes: [{ w: 595, h: 842 }] } } : { result: true });

test('an abort while opening restarts that worker; the next open works', async () => {
  const pool = new EnginePool(2); spawned = 0;
  let first = true;
  answer = (m) => (m.op === 'open' && first ? ((first = false), { error: 'RuntimeError: unreachable' }) : opened(m));
  await assert.rejects(pool.open(new Uint8Array(10)), /unreachable/);
  await tick();
  assert.equal(spawned, 1);
  assert.equal((await pool.open(new Uint8Array(10))).length, 1);
  pool.destroy();
});

test('an engine that keeps crashing is stopped: no more workers, every job says ENGINE_STOPPED', async () => {
  const pool = new EnginePool(2), health = [];
  pool.onHealth = (h) => health.push(h.kind);
  answer = (m) => (m.op === 'open' ? { error: 'RuntimeError: Aborted(OOM)' } : { result: true });
  for (let i = 0; i < 3; i++) { await pool.open(new Uint8Array(10)).catch(() => {}); await tick(); }
  assert.ok(health.includes('stopped'));
  spawned = 0;
  await assert.rejects(pool.run({ op: 'render', page: 0, priority: 0, args: {} }), /ENGINE_STOPPED/);
  await assert.rejects(pool.open(new Uint8Array(10)), /ENGINE_STOPPED/);
  assert.equal(spawned, 0);
  pool.destroy();
});

test('memory budget: big files open in fewer workers, too big ones are refused', async () => {
  const MB = 2 ** 20;
  assert.equal(workersFor(100 * MB, 4, 8), 4);
  assert.equal(workersFor(500 * MB, 4, 8), 2);
  assert.equal(workersFor(1000 * MB, 4, 8), 1);
  assert.equal(workersFor(1100 * MB, 4, 8), 0);
  const pool = new EnginePool(4); pool.memoryGB = 1 / 64; // 4 MB budget: 2 MB per worker copy
  answer = opened; spawned = 0;
  await pool.open(new Uint8Array(MB)); // 2 workers fit
  await assert.rejects(pool.open(new Uint8Array(3 * MB)), /TOO_LARGE/); // refused before the open file is let go
  assert.equal(spawned, 0);
  await pool.open(new Uint8Array(10));
  assert.equal(spawned, 2); // a small file has all 4 workers again
  pool.destroy();
});
