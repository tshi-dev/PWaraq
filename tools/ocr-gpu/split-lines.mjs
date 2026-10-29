// Line boxes for the silver-label pool, from the shipped Tesseract `ara` model (the pipeline's own line splitter):
//   node tools/ocr-gpu/split-lines.mjs [--work ../ocr-gpu-work]   → WORK/pool/lines.json  [{page, w, h, lines: [{x0,y0,x1,y1,tess}]}]
// tools/ocr-gpu/crop_lines.py then cuts the line pictures. Pages already in lines.json are skipped (resumable).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { linesOf } from '../../src/lib/ocr.ts';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const root = path.join(import.meta.dirname, '..', '..'), work = path.resolve(root, arg('work', '../ocr-gpu-work')), dir = path.join(work, 'pool');
const out = path.join(dir, 'lines.json'), have = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : [], seen = new Set(have.map((p) => p.page));
const T = createRequire(import.meta.url)('tesseract.js');
const w = await T.createWorker('ara', 1, { langPath: path.join(root, 'public', 'ocr'), gzip: true, cacheMethod: 'none' });
await w.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '1' });
for (const f of fs.readdirSync(path.join(dir, 'pages')).filter((f) => f.endsWith('.jpg')).sort()) {
  if (seen.has(f)) continue;
  const { data } = await w.recognize(fs.readFileSync(path.join(dir, 'pages', f)), {}, { blocks: true });
  const lines = linesOf(data).filter((l) => l.words.length >= 3).map((l) => ({
    x0: Math.min(...l.words.map((x) => x.x0)), y0: Math.min(...l.words.map((x) => x.y0)), x1: Math.max(...l.words.map((x) => x.x1)), y1: Math.max(...l.words.map((x) => x.y1)), tess: l.words.map((x) => x.text).join(' '),
  })).filter((l) => l.y1 - l.y0 >= 14 && l.x1 - l.x0 >= 4 * (l.y1 - l.y0)); // a real text line: not a speck, not a vertical sliver
  have.push({ page: f, w: data.imageWidth ?? 0, lines });
  fs.writeFileSync(out, JSON.stringify(have));
  console.log(f, lines.length, 'lines');
}
await w.terminate();
