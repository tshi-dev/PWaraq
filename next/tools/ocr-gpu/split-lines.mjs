// Line boxes for the silver-label pool, from the shipped Tesseract `ara` model (the pipeline's own line splitter):
//   node tools/ocr-gpu/split-lines.mjs [--work ../ocr-gpu-work] [--max N]   → WORK/pool/lines.json  [{page, w, h, lines: [{x0,y0,x1,y1,tess}]}]
// tools/ocr-gpu/crop_lines.py then cuts the line pictures. Pages already in lines.json are skipped (resumable).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { linesOf } from '../../src/lib/ocr.ts';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const root = path.join(import.meta.dirname, '..', '..'), work = path.resolve(root, arg('work', '../ocr-gpu-work')), dir = path.join(work, 'pool');
const out = path.join(dir, 'lines.json'), have = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : [], seen = new Set(have.map((p) => p.page));
const spread = (f) => f.replace(/^c-(\d+)-(\d+)/, 'c-$2-$1');   // Commons c-WORK-PAGE: page 1 of every work, then page 2, ...: a round samples all works (in name order one bad scan stalled the agreement for days)
const T = createRequire(import.meta.url)('tesseract.js');
// --max N: at most N new pages a run (the GPU rounds of run-forever.ps1 start soon); --workers K pages read at once (one Tesseract each)
const todo = fs.readdirSync(path.join(dir, 'pages')).filter((f) => f.endsWith('.jpg') && !seen.has(f)).sort((a, b) => (spread(a) < spread(b) ? -1 : 1)).slice(0, +arg('max', Infinity));
const workers = await Promise.all(Array.from({ length: Math.min(+arg('workers', 8), todo.length) }, async () => {
  const w = await T.createWorker('ara', 1, { langPath: path.join(root, 'public', 'ocr'), gzip: true, cacheMethod: 'none' });
  await w.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '1' });
  return w;
}));
let n = 0;
const save = () => { fs.writeFileSync(out + '.tmp', JSON.stringify(have)); fs.renameSync(out + '.tmp', out); }; // atomic: a kill never leaves half a file
await Promise.all(workers.map(async (w) => {
  for (let f; (f = todo.shift()); ) {
    const { data } = await w.recognize(fs.readFileSync(path.join(dir, 'pages', f)), {}, { blocks: true });
    const lines = linesOf(data).filter((l) => l.words.length >= 3).map((l) => ({
      x0: Math.min(...l.words.map((x) => x.x0)), y0: Math.min(...l.words.map((x) => x.y0)), x1: Math.max(...l.words.map((x) => x.x1)), y1: Math.max(...l.words.map((x) => x.y1)), tess: l.words.map((x) => x.text).join(' '),
    })).filter((l) => l.y1 - l.y0 >= 14 && l.x1 - l.x0 >= 4 * (l.y1 - l.y0)); // a real text line: not a speck, not a vertical sliver
    have.push({ page: f, w: data.imageWidth ?? 0, lines });
    if (++n % 20 === 0) save(); // every 20 pages: a crash loses at most those
    console.log(f, lines.length, 'lines');
  }
}));
save();
await Promise.all(workers.map((w) => w.terminate()));
