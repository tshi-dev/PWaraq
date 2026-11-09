// "Check before sharing": finds what a file gives away without showing it (fake redaction, hidden text, details, hidden
// content) and removes each kind. Pure (MuPDF passed in) so the Node self-check (tests/unit/checkshare.test.mjs) runs the same code.
// Page coordinates are MuPDF's: points, origin top-left, y down. Files must be unencrypted (the worker decrypts first).
import type * as MuPDF from '../../../engine/mupdf-wasm/dist/mupdf.js';
import { compress } from './tools.ts';
import { redact, type Mark } from './redact.ts';

export type FindingId = 'fake' | 'white' | 'outside' | 'tiny' | 'invisible' | 'ocr' | 'meta' | 'comments' | 'forms' | 'files' | 'script' | 'layers' | 'bookmarks' | 'size';
/** `n`: how many (characters, boxes, items; megabytes for size). `pages`: 1-based. `items`: [label key, value] for details and bookmarks. */
export type Finding = { id: FindingId; n: number; pages: number[]; items: [string, string][]; fix: boolean };
export const FIXABLE: FindingId[] = ['fake', 'meta', 'comments', 'forms', 'files', 'script', 'bookmarks', 'size'];
export const LARGE = 5 * 1048576; // from here a file is offered a smaller copy

type Box = [number, number, number, number];
type Glyph = { x: number; y: number; seq: number; lum: number; alpha: number; size: number; ignored: boolean };
type Fill = { box: Box; seq: number; lum: number; alpha: number; rect: boolean; image: boolean };
const inside = (b: Box, x: number, y: number) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
const lumOf = (c: number[]) => c.length === 1 ? c[0] : c.length === 3 ? 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2] : c.length === 4 ? (1 - Math.min(1, c[0] + c[3])) * 0.3 + (1 - Math.min(1, c[1] + c[3])) * 0.59 + (1 - Math.min(1, c[2] + c[3])) * 0.11 : 0.5;
const at = (m: number[], x: number, y: number) => [x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5]];

/** Everything one page paints, in painting order: filled shapes and pictures, and the position of each letter. */
function paint(m: typeof MuPDF, page: MuPDF.Page) {
  const fills: Fill[] = [], glyphs: Glyph[] = [];
  let seq = 0;
  const shape = (p: MuPDF.Path, ctm: number[]) => {
    let curved = false, n = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x: number, y: number) => { const [a, b] = at(ctm, x, y); x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, a); y1 = Math.max(y1, b); };
    p.walk({ moveTo(x, y) { n++; add(x, y); }, lineTo(x, y) { n++; add(x, y); }, curveTo(a, b, c, d, e, f) { curved = true; add(a, b); add(c, d); add(e, f); }, closePath() {} });
    return { box: [x0, y0, x1, y1] as Box, rect: !curved && n >= 4 && n <= 5 };
  };
  const text = (t: MuPDF.Text, ctm: number[], lum: number, alpha: number, ignored: boolean) => t.walk({
    showGlyph(_f, trm, _g, uni) {
      if (uni <= 32) return;
      const [x, y] = at(ctm, trm[4], trm[5]), size = Math.hypot(trm[0], trm[1]) * Math.hypot(ctm[0], ctm[1]);
      glyphs.push({ x, y: y - size * 0.3, seq: seq++, lum, alpha, size, ignored }); // the middle of the letter, not its baseline
    },
  });
  const dev = new m.Device({
    fillPath(path, _eo, ctm, cs, color, alpha) { fills.push({ ...shape(path, ctm as number[]), seq: seq++, lum: lumOf(color), alpha, image: false }); void cs; },
    fillText(t, ctm, _cs, color, alpha) { text(t, ctm as number[], lumOf(color), alpha, false); },
    ignoreText(t, ctm) { text(t, ctm as number[], 0, 1, true); },
    fillImage(_i, ctm, alpha) {
      const c = ctm as number[], xs = [c[4], c[4] + c[0], c[4] + c[2], c[4] + c[0] + c[2]], ys = [c[5], c[5] + c[1], c[5] + c[3], c[5] + c[1] + c[3]];
      fills.push({ box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], seq: seq++, lum: 0.5, alpha, rect: true, image: true });
    },
  });
  page.run(dev, m.Matrix.identity); dev.close(); dev.destroy();
  return { fills, glyphs };
}

const DARK = 0.2;
/** Black boxes over text that is still in the file, per page (the boxes are what real redaction must remove). */
function fakeBoxes(m: typeof MuPDF, doc: MuPDF.PDFDocument): { marks: Mark[]; kinds: Record<string, { n: number; pages: Set<number> }> } {
  const marks: Mark[] = [], kinds = Object.fromEntries(['white', 'outside', 'tiny', 'invisible', 'ocr'].map((k) => [k, { n: 0, pages: new Set<number>() }]));
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i), [px0, py0, px1, py1] = page.getBounds(), { fills, glyphs } = paint(m, page);
    page.destroy();
    const full = fills.some((f) => f.image && (f.box[2] - f.box[0]) * (f.box[3] - f.box[1]) >= 0.5 * (px1 - px0) * (py1 - py0)); // a scanned page: its invisible text is the OCR layer
    const seen = new Set<string>();
    for (const f of fills) {
      const [x0, y0, x1, y1] = f.box;
      if (f.image || !f.rect || f.lum >= DARK || f.alpha < 0.9 || x1 - x0 < 8 || y1 - y0 < 4 || (x1 - x0) * (y1 - y0) > 0.5 * (px1 - px0) * (py1 - py0)) continue;
      const key = f.box.map(Math.round).join(), under = glyphs.some((g) => inside(f.box, g.x, g.y) && (g.seq < f.seq || g.ignored || g.lum < 0.3)); // text drawn after the box in a light colour is simply on it
      if (under && !seen.has(key)) { seen.add(key); marks.push({ page: i, x: x0, y: y0, w: x1 - x0, h: y1 - y0 }); }
    }
    for (const g of glyphs) {
      const k = g.x < px0 - 1 || g.x > px1 + 1 || g.y < py0 - 1 || g.y > py1 + 1 ? 'outside' : g.ignored ? (full ? 'ocr' : 'invisible')
        : g.alpha < 0.05 || (g.lum >= 0.97 && !fills.some((f) => f.seq < g.seq && f.alpha > 0.5 && (f.image || f.lum < 0.97) && inside(f.box, g.x, g.y))) ? 'white' : g.size < 2 ? 'tiny' : '';
      if (k) { kinds[k].n++; kinds[k].pages.add(i + 1); }
    }
  }
  return { marks, kinds };
}

const META: [string, string][] = [['author', 'info:Author'], ['creator', 'info:Creator'], ['producer', 'info:Producer'], ['title', 'info:Title'], ['subject', 'info:Subject'], ['keywords', 'info:Keywords'], ['created', 'info:CreationDate'], ['modified', 'info:ModDate']];
const isJs = (o: MuPDF.PDFObject) => o.isDictionary() && (o.get('S').isName() ? o.get('S').asName() === 'JavaScript' : false);
const hasScript = (o: MuPDF.PDFObject) => isJs(o.get('A')) || (o.get('AA').isDictionary() && (() => { let any = false; o.get('AA').forEach((v) => { if (isJs(v)) any = true; }); return any; })());
const count = (o: MuPDF.PDFObject) => o.isArray() ? o.length : o.isDictionary() ? (() => { let n = 0; o.forEach(() => n++); return n; })() : 0;
const names = (root: MuPDF.PDFObject, key: string) => { const t = root.get('Names', key); return t.isDictionary() ? t : null; };
/** Names in a name tree (EmbeddedFiles, JavaScript): leaves are /Names [name obj …], inner nodes /Kids. */
function leaves(tree: MuPDF.PDFObject, depth = 0): number { const l = tree.get('Names'), k = tree.get('Kids'); return (l.isArray() ? l.length / 2 : 0) + (k.isArray() && depth < 8 ? [...Array(k.length).keys()].reduce((s, i) => s + leaves(k.get(i), depth + 1), 0) : 0); }
function outline(items: { title?: string; down?: unknown[] }[] | null, out: string[] = []): string[] { for (const o of items ?? []) { out.push(o.title ?? ''); outline(o.down as typeof items, out); } return out; }

type Pages = (page: MuPDF.PDFPage, i: number) => void;
const eachPage = (doc: MuPDF.PDFDocument, f: Pages) => { for (let i = 0; i < doc.countPages(); i++) { const p = doc.loadPage(i) as MuPDF.PDFPage; try { f(p, i); } finally { p.destroy(); } } };
const SKIP = new Set(['Link', 'Widget', 'FileAttachment', 'Popup']);

/** What the file gives away, in the order a person fixes it. An empty list means nothing was found. */
export function scan(m: typeof MuPDF, bytes: Uint8Array): Finding[] {
  const doc = m.Document.openDocument(bytes, 'application/pdf').asPDF()!, root = doc.getTrailer().get('Root'), out: Finding[] = [];
  const add = (id: FindingId, n: number, pages: Iterable<number> = [], items: [string, string][] = []) => { if (n) out.push({ id, n, pages: [...new Set(pages)].sort((a, b) => a - b), items, fix: FIXABLE.includes(id) }); };
  try {
    const { marks, kinds } = fakeBoxes(m, doc);
    add('fake', marks.length, marks.map((k) => k.page + 1));
    for (const k of ['white', 'outside', 'tiny', 'invisible', 'ocr'] as const) add(k, kinds[k].n, kinds[k].pages);
    const meta = META.map(([k, key]) => [k, doc.getMetaData(key) ?? ''] as [string, string]).filter(([, v]) => v.trim());
    if (root.get('Metadata').isStream()) meta.push(['xmp', '']);
    add('meta', meta.length, [], meta);

    const notes: number[] = [], forms: number[] = [], files: number[] = [], scripts: number[] = [];
    eachPage(doc, (p, i) => {
      for (const a of p.getAnnotations()) {
        const type = a.getType();
        if (type === 'FileAttachment') files.push(i + 1);
        else if (!SKIP.has(type)) notes.push(i + 1);
        if (type !== 'Widget' && type !== 'Popup' && hasScript(a.getObject())) scripts.push(i + 1);
      }
      for (const w of p.getWidgets()) { if (!['', 'Off'].includes((w.getValue() ?? '').trim())) forms.push(i + 1); if (hasScript(w.getObject())) scripts.push(i + 1); }
      if (p.getObject().get('AA').isDictionary()) scripts.push(i + 1);
    });
    add('comments', notes.length, notes); add('forms', forms.length, forms);
    const ef = names(root, 'EmbeddedFiles'), js = names(root, 'JavaScript');
    add('files', files.length + (ef ? leaves(ef) : 0), files);
    add('script', scripts.length + (js ? leaves(js) : 0) + (isJs(root.get('OpenAction')) ? 1 : 0) + (root.get('AA').isDictionary() ? 1 : 0), scripts);
    const ocgs = root.get('OCProperties', 'OCGs');
    add('layers', ocgs.isArray() ? ocgs.length : 0);
    const marksTitles = outline(doc.loadOutline());
    add('bookmarks', marksTitles.length, [], marksTitles.slice(0, 5).map((s) => ['bookmark', s]));
    if (bytes.length > LARGE) add('size', Math.round(bytes.length / 104857.6) / 10);
  } finally { doc.destroy(); }
  return out;
}

/** The file with one kind of finding removed. Unencrypted bytes in and out (the worker and the app handle the password). */
export function fix(m: typeof MuPDF, bytes: Uint8Array, id: FindingId): Uint8Array {
  if (id === 'fake') return redact(m, bytes, fakeBoxesOf(m, bytes));
  if (id === 'size') return compress(m, bytes, 'recommended');
  const doc = m.Document.openDocument(bytes, 'application/pdf').asPDF()!, root = doc.getTrailer().get('Root');
  const dropNames = (key: string) => { const n = root.get('Names'); if (n.isDictionary()) n.delete(key); };
  if (id === 'meta') { doc.getTrailer().delete('Info'); root.delete('Metadata'); }
  if (id === 'bookmarks') root.delete('Outlines');
  if (id === 'files') dropNames('EmbeddedFiles');
  if (id === 'script') { dropNames('JavaScript'); root.delete('AA'); if (isJs(root.get('OpenAction'))) root.delete('OpenAction'); }
  if (id === 'comments' || id === 'files' || id === 'forms' || id === 'script') eachPage(doc, (p) => {
    for (const a of [...p.getAnnotations(), ...p.getWidgets()]) {
      const type = a.getType(), o = a.getObject();
      if ((id === 'comments' && !SKIP.has(type)) || (id === 'files' && type === 'FileAttachment')) p.deleteAnnotation(a);
      if (id === 'script') { if (isJs(o.get('A'))) o.delete('A'); o.delete('AA'); } // a link's plain address stays
      if (id === 'forms' && type === 'Widget') {
        try { (a as MuPDF.PDFWidget).setTextValue(''); } catch {} // a text field draws its empty answer; other kinds lose their value below
        for (let f = o; f.isDictionary(); f = f.get('Parent')) { f.delete('V'); f.delete('DV'); }
      }
    }
    if (id === 'script') p.getObject().delete('AA');
  });
  return doc.saveToBuffer('garbage=4,compress').asUint8Array().slice();
}

function fakeBoxesOf(m: typeof MuPDF, bytes: Uint8Array) {
  const doc = m.Document.openDocument(bytes, 'application/pdf').asPDF()!;
  try { return fakeBoxes(m, doc).marks; } finally { doc.destroy(); }
}
