// Quick tools: the id → task map and the #tool=<id> deep link.  pnpm test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, toolFromHash, isTool } from '../../src/lib/quicktools.ts';

test('the eleven tool ids of the contract, each with its task and what it opens at', () => {
  assert.deepEqual(Object.keys(TOOLS).sort(), ['compress', 'delete-pages', 'images-to-pdf', 'merge', 'ocr', 'pdf-to-images', 'protect', 'rotate', 'sign', 'split', 'unlock']);
  const shape = Object.fromEntries(Object.entries(TOOLS).map(([id, q]) => [id, [q.task, q.at ?? '', q.accepts, q.multiple]]));
  assert.deepEqual(shape, {
    'images-to-pdf': ['organize', '', 'images', true], merge: ['organize', '', 'pdf', true],
    split: ['organize', 'split', 'pdf', false], rotate: ['organize', 'rotate', 'pdf', false], 'delete-pages': ['organize', 'delete-pages', 'pdf', false],
    compress: ['view', 'compress', 'pdf', false], 'pdf-to-images': ['convert', 'pdf-to-images', 'pdf', false],
    protect: ['protect', 'protect', 'pdf', false], unlock: ['protect', 'unlock', 'pdf', false],
    sign: ['sign', '', 'pdf', false], ocr: ['ocr', '', 'pdf', false],
  });
});

test('deep link: #tool=<id> gives the tool; anything else gives nothing', () => {
  assert.equal(toolFromHash('#tool=compress'), 'compress');
  assert.equal(toolFromHash('#tool=delete-pages'), 'delete-pages');
  assert.equal(toolFromHash('tool=rotate'), 'rotate');
  assert.equal(toolFromHash('#x=1&tool=ocr'), 'ocr');
  for (const h of ['', '#', '#tool=', '#tool=nope', '#tool=COMPRESS', '#tool=toString', '#tool=__proto__', '#compress']) assert.equal(toolFromHash(h), null, h);
  assert.equal(isTool('constructor'), false);
});
