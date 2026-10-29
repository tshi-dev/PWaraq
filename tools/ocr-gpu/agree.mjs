// Silver labels: keeps the pool lines two teachers read the same (normalised CER <= 2 %) and writes them in tesstrain's layout
//   node tools/ocr-gpu/agree.mjs A.jsonl B.jsonl [--work ../ocr-gpu-work] [--cer 0.02]  → WORK/gt/NNNN_LL.png + .gt.txt, WORK/gt.stats.json
// Also dropped: a line either teacher left empty, whose text is more than twice/under half as long as Tesseract's own
// reading of it, or that Tesseract's reading matches under 40 % (two teachers repeating the same hallucination).
import fs from 'node:fs';
import path from 'node:path';
import { norm, editDistance } from './textcmp.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const [fa, fb] = process.argv.slice(2), work = path.resolve(import.meta.dirname, '..', '..', arg('work', '../ocr-gpu-work')), maxCer = +arg('cer', 0.02);
const load = (f) => new Map(fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((j) => [j.id, j.text]));
const A = load(fa), B = load(fb), jobs = JSON.parse(fs.readFileSync(path.join(work, 'pool', 'lines.list.json'), 'utf8'));
const out = path.join(work, 'gt'); fs.mkdirSync(out, { recursive: true });
const strip = (s) => s.normalize('NFC').replace(/[ً-ْٰـ]/g, '').replace(/\s+/g, ' ').trim(); // the label keeps punctuation, loses tashkeel (agreement is measured without it)
const cer = (x, y) => { const a = [...norm(x)], b = [...norm(y)]; return a.length ? editDistance(a, b) / Math.max(a.length, b.length) : 1; };
const st = { lines: jobs.length, both: 0, empty: 0, disagree: 0, length: 0, tess: 0, kept: 0, chars: 0 };
for (const j of jobs) {
  const a = A.get(j.id), b = B.get(j.id);
  if (a === undefined || b === undefined) continue;
  st.both++;
  const na = norm(a), nb = norm(b);
  if (!na || !nb) { st.empty++; continue; }
  if (cer(a, b) > maxCer) { st.disagree++; continue; }
  const nt = norm(j.tess);
  if (na.length > 2 * nt.length || na.length < nt.length / 2) { st.length++; continue; }
  if (cer(a, j.tess) > 0.6) { st.tess++; continue; }
  fs.copyFileSync(j.file, path.join(out, j.id + '.png'));
  fs.writeFileSync(path.join(out, j.id + '.gt.txt'), strip(a) + '\n');
  st.kept++; st.chars += strip(a).length;
}
fs.writeFileSync(path.join(work, 'gt.stats.json'), JSON.stringify(st, null, 1));
console.log(st);
