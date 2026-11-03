// Edit one page of a file whose pages share a big image, a font and a form, then put it back (Workspace "edited"): the file must not grow
// by a copy of the shared parts per page (beta 4: 3.5 MB, 54 pages -> 175 MB).   node --test tests/unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import * as hb from 'harfbuzzjs';
import { editPage, pageObjects } from '../../src/lib/engine/editpage.ts';
import { assemble } from '../../src/lib/engine/assemble.ts';

const file = (f) => new Uint8Array(fs.readFileSync(new URL('../../public/fonts/' + f, import.meta.url)));
const fonts = { regular: new m.Font('Tajawal', file('Tajawal-Regular.ttf')), bold: new m.Font('Tajawal-Bold', file('Tajawal-Bold.ttf')) };
const photo = new Uint8Array(fs.readFileSync(new URL('../fixtures/photo.png', import.meta.url)));
const PAGES = 20, EDITED = 3;

function shared() { // 20 pages drawing one 300 x 300 noise picture, one form and one font
  const d = new m.PDFDocument(), pix = new m.Pixmap(m.ColorSpace.DeviceRGB, [0, 0, 300, 300], false), px = pix.getPixels();
  for (let i = 0; i < px.length; i++) px[i] = (i * 2654435761 >>> 13) & 255;
  const img = d.addImage(new m.Image(pix)), font = d.addFont(new m.Font('Tajawal', file('Tajawal-Regular.ttf')));
  const form = d.addStream('0.9 g 0 0 100 20 re f', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 20] });
  for (let i = 0; i < PAGES; i++) d.insertPage(-1, d.addPage([0, 0, 595, 842], 0, { XObject: { Im0: img, Fm0: form }, Font: { F0: font } }, `q 200 0 0 200 50 500 cm /Im0 Do Q /Fm0 Do BT /F0 14 Tf 50 400 Td (Page ${i}) Tj ET`));
  return d.saveToBuffer('garbage=compact,compress').asUint8Array().slice();
}
const orig = shared(), open = (b) => m.Document.openDocument(b, 'application/pdf');
const text = { kind: 'text', text: 'Hello edit', x: 50, y: 100, w: 200, h: 30, size: 14, color: [0, 0, 0], bold: false, align: 'left' };

// what Workspace does: the edited page saved alone, then built into the file in place of the old one
const put = (edits) => {
  const doc = open(orig), one = editPage(m, doc.asPDF(), EDITED, edits, [photo], () => fonts, false, { hb, file }).saveToBuffer('garbage=compact,compress').asUint8Array().slice(), ed = open(one);
  const out = assemble(m, (id) => (id ? { doc: ed, bytes: new Uint8Array() } : { doc, bytes: new Uint8Array() }), { items: [...Array(PAGES)].map((_, i) => (i === EDITED ? { doc: 1, page: 0 } : { doc: 0, page: i })) });
  return { out, doc: open(out) };
};

test('rebuilding a file does not copy what its pages share, once per page', () => {
  const doc = open(orig), plain = assemble(m, () => ({ doc, bytes: new Uint8Array() }), { items: [...Array(PAGES)].map((_, i) => ({ doc: 0, page: i })) });
  assert.ok(plain.length < orig.length * 1.2, `${plain.length} vs ${orig.length}`);
});

test('an edited page goes back without a second copy of the shared picture, font and form', () => {
  const { out, doc } = put([text]);
  assert.ok(out.length < orig.length * 1.2 + 20_000, `${out.length} vs ${orig.length}`);
  assert.equal(doc.countPages(), PAGES);
  assert.match(doc.loadPage(EDITED).toStructuredText().asText(), /Hello edit/);
  assert.equal(pageObjects(doc.loadPage(EDITED)).images.length, 1);
  assert.equal(pageObjects(doc.loadPage(7)).images.length, 1); // the other pages keep the shared picture
});

test('a moved area and a replaced picture still come out right and cost only what is new', () => {
  let r = put([{ kind: 'move', from: { x: 50, y: 50, w: 200, h: 100 }, x: 80, y: 200, w: 200, h: 100 }]);
  assert.ok(r.out.length < orig.length * 1.2 + 20_000, `${r.out.length} vs ${orig.length}`);
  assert.ok(pageObjects(r.doc.loadPage(EDITED)).images.length >= 1); // the moved area still draws the picture
  const box = pageObjects(open(orig).loadPage(EDITED)).images[0];
  r = put([{ kind: 'image', index: 0, from: box, ...box, photo: 0 }]); // a different picture on this page only
  assert.ok(r.out.length < orig.length * 1.2 + photo.length * 2 + 20_000, `${r.out.length} vs ${orig.length}`);
  assert.equal(pageObjects(r.doc.loadPage(EDITED)).images.length, 1);
  assert.equal(pageObjects(r.doc.loadPage(EDITED + 1)).images.length, 1); // the other pages keep the shared one
});
