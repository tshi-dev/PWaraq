import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint } from '../../src/lib/fingerprint.ts';

test('same bytes, same fingerprint; a same-length edit at the end or on the sampled grid changes it', () => {
  const a = new Uint8Array(5000).map((_, i) => i % 251), b = a.slice();
  assert.equal(fingerprint(a), fingerprint(b));
  b[4990] ^= 1; assert.notEqual(fingerprint(a), fingerprint(b));
  const c = a.slice(); c[610] ^= 1; assert.notEqual(fingerprint(a), fingerprint(c));
});
