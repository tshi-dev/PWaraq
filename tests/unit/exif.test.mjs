// Phone photos are stored sideways with an EXIF orientation; Images to PDF must draw them upright (PDF readers ignore EXIF).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { imagesPdf, orientation } from '../../src/lib/engine/assemble.ts';

// a 32 x 16 JPEG, left half red, right half blue, with an EXIF block saying Orientation = `o` (6: turn a quarter clockwise)
function photo(o) {
  const pix = new m.Pixmap(m.ColorSpace.DeviceRGB, [0, 0, 32, 16], false), px = pix.getPixels();
  for (let i = 0; i < 32 * 16; i++) { const red = i % 32 < 16; px[i * 3] = red ? 255 : 0; px[i * 3 + 1] = 0; px[i * 3 + 2] = red ? 0 : 255; }
  const jpg = pix.asJPEG(95, false);
  const exif = [0xff, 0xe1, 0, 34, ...'Exif'.split('').map((c) => c.charCodeAt(0)), 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, o, 0, 0, 0, 0, 0, 0];
  return Uint8Array.from([...jpg.subarray(0, 2), ...exif, ...jpg.subarray(2)]);
}
const color = (s, w, x, y) => { const i = (y * w + x) * 3; return s[i] > 128 ? 'red' : s[i + 2] > 128 ? 'blue' : '?'; };
function drawn(bytes) {
  const p = m.Document.openDocument(imagesPdf(m, [{ bytes, mime: 'image/jpeg' }]), 'application/pdf').loadPage(0);
  const pix = p.toPixmap(m.Matrix.scale(2, 2), m.ColorSpace.DeviceRGB, false), w = pix.getWidth(), h = pix.getHeight(), s = pix.getPixels();
  return { w, h, top: color(s, w, w >> 1, 2), bottom: color(s, w, w >> 1, h - 3), left: color(s, w, 2, h >> 1), right: color(s, w, w - 3, h >> 1) };
}

test('the orientation is read from the JPEG; other files say 1', () => {
  assert.equal(orientation(photo(6)), 6);
  assert.equal(orientation(photo(3)), 3);
  assert.equal(orientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), 1);
  assert.equal(orientation(photo(6).subarray(0, 30)), 1); // cut short
});

test('Orientation 6: the page is portrait and the left of the stored photo is at the top', () => {
  const d = drawn(photo(6));
  assert.ok(d.h > d.w, `${d.w}x${d.h}`);
  assert.deepEqual([d.top, d.bottom], ['red', 'blue']);
});

test('Orientation 8 and 3 turn the other ways; 1 stays as stored', () => {
  const eight = drawn(photo(8)), three = drawn(photo(3)), one = drawn(photo(1));
  assert.ok(eight.h > eight.w);
  assert.deepEqual([eight.top, eight.bottom], ['blue', 'red']);
  assert.deepEqual([three.left, three.right], ['blue', 'red']);
  assert.deepEqual([one.left, one.right], ['red', 'blue']);
  assert.ok(one.w > one.h);
});
