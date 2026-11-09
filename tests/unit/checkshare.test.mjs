// Self-check of "Check before sharing" with the real engine build:  pnpm test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { scan, fix } from '../../src/lib/engine/checkshare.ts';
import { pageWriter } from '../../src/lib/engine/textpage.ts';

const font = (f) => new m.Font(f, fs.readFileSync(new URL('../../public/fonts/' + f + '.ttf', import.meta.url)));
const fonts = { regular: font('Tajawal-Regular'), bold: font('Tajawal-Bold') };
const open = (b) => m.Document.openDocument(b, 'application/pdf');
const ids = (b) => scan(m, b).map((f) => f.id);

// a page with a line of text, a black box drawn over it (the text is still there), an author and one comment
function sample() {
  const doc = new m.PDFDocument(), w = pageWriter(m, doc, fonts);
  doc.insertPage(-1, w.add({ w: 595, h: 842, lines: [{ text: 'Account 987654321 is secret', x: 72, y: 100, size: 14 }, { text: 'Nothing to hide here', x: 72, y: 300, size: 14 }] }));
  w.finish();
  const page = doc.findPage(0), box = doc.addStream('q 0 0 0 rg 60 715 260 40 re f Q', {}), c = page.get('Contents');
  if (c.isArray()) c.push(box); else page.put('Contents', doc.newArray()), page.get('Contents').push(c), page.get('Contents').push(box);
  const pg = doc.loadPage(0);
  pg.createAnnotation('Text').setContents('ask Sami about this');
  pg.destroy();
  doc.setMetaData('info:Author', 'Sami Writer');
  return doc.saveToBuffer('').asUint8Array().slice();
}

test('scan finds the fake redaction box, the author and the comment; a plain page is clean', () => {
  const found = scan(m, sample());
  assert.deepEqual(found.map((f) => f.id), ['fake', 'meta', 'comments']);
  assert.equal(found[0].n, 1);
  assert.deepEqual(found[0].pages, [1]);
  assert.ok(found[1].items.some(([k, v]) => k === 'author' && v === 'Sami Writer'));
  const plain = new m.PDFDocument(), w = pageWriter(m, plain, fonts);
  plain.insertPage(-1, w.add({ w: 595, h: 842, lines: [{ text: 'Hello', x: 72, y: 100, size: 14 }] }));
  w.finish();
  assert.deepEqual(ids(plain.saveToBuffer('').asUint8Array().slice()), []);
});

test('each fix removes its finding and leaves the others', () => {
  const src = sample();
  const redacted = fix(m, src, 'fake');
  assert.ok(!ids(redacted).includes('fake'));
  assert.ok(!open(redacted).loadPage(0).toStructuredText().asText().includes('987654321'), 'the number is still in the file');
  assert.ok(open(redacted).loadPage(0).toStructuredText().asText().includes('Nothing to hide'));
  assert.deepEqual(ids(fix(m, src, 'meta')), ['fake', 'comments']);
  assert.deepEqual(ids(fix(m, src, 'comments')), ['fake', 'meta']);
  assert.equal(open(fix(m, src, 'meta')).getMetaData('info:Author') ?? '', '');
});
