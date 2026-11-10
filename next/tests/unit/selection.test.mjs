// The editor's layer order for several chosen layers at once:  node --test tests/unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restack } from '../../src/lib/selection.ts';

// back first; capitals are chosen, '-' is not a listed layer (a replaced line) and keeps its place
const run = (s, to) => restack([...s], (c) => c !== '-', (c) => c !== '-' && c === c.toUpperCase(), to).join('');

test('front and back take every chosen layer, in its order', () => {
  assert.equal(run('aBcDe', 'front'), 'aceBD');
  assert.equal(run('aBcDe', 'back'), 'BDace');
});

test('forward and backward move each chosen layer one step; a block moves together', () => {
  assert.equal(run('aBCd', 'forward'), 'adBC');
  assert.equal(run('aBCd', 'backward'), 'BCad');
  assert.equal(run('aBcD', 'backward'), 'BaDc'); // each one step: B past a, D past c
  assert.equal(run('aBcD', 'forward'), 'acBD'); // D is already in front
  assert.equal(run('AB', 'forward'), 'AB');
});

test('things the panel does not list keep their places', () => {
  assert.equal(run('a-B-c', 'forward'), 'a-c-B');
  assert.equal(run('a-B-c', 'backward'), 'B-a-c');
});
