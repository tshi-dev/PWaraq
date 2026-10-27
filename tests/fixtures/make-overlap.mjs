// overlap.pdf: a big background picture (light blue 400x240) with a smaller one on it (red 150x100), then a green box with a
// line of text below them — the layout of a slide whose chart is a picture over the slide's picture. node tests/fixtures/make-overlap.mjs
import fs from 'node:fs';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';

const doc = new m.PDFDocument(), helv = doc.addSimpleFont(new m.Font('Helvetica'));
const photo = (r, g, b, w, h) => { const p = new m.Pixmap(m.ColorSpace.DeviceRGB, [0, 0, w, h], false), s = p.getPixels(); for (let i = 0; i < s.length; i += 3) { s[i] = r; s[i + 1] = g; s[i + 2] = b; } return doc.addImage(new m.Image(p)); };
const ops = 'q 400 0 0 240 72 542 cm /Bg Do Q q 150 0 0 100 200 622 cm /Chart Do Q 0.1 0.6 0.3 rg 90 462 100 40 re f BT /F1 14 Tf 0 g 100 477 Td (MOVE ME) Tj ET';
doc.insertPage(-1, doc.addPage([0, 0, 595, 842], 0, { Font: { F1: helv }, XObject: { Bg: photo(200, 220, 255, 400, 240), Chart: photo(220, 30, 30, 150, 100) } }, ops));
fs.writeFileSync(new URL('overlap.pdf', import.meta.url), doc.saveToBuffer('compress').asUint8Array());
