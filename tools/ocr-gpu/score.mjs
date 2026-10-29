// Scores a teacher's readings (DIR/<name>.txt from read_pages.py, or the --out of ocr-accuracy.mjs) against the test set's
// truth with the SAME text comparison as tools/ocr-accuracy.mjs (norm / words right / chars right), sliced by the real-page tags.
//   node tools/ocr-gpu/score.mjs DIR [--list pages.txt]      (placement is not measured: teachers give text, not boxes)
import fs from 'node:fs';
import path from 'node:path';
import { wordsRight, charsRight } from './textcmp.mjs';
const root = path.join(import.meta.dirname, '..', '..'), set = path.join(root, 'tests', 'fixtures', 'ocr', 'real');
const dir = process.argv[2], li = process.argv.indexOf('--list'), list = li > 0 ? fs.readFileSync(process.argv[li + 1], 'utf8').split(/\r?\n/).filter(Boolean).map((f) => path.basename(f, '.pdf')) : fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).map((f) => f.slice(0, -4));
const tags = new Map(JSON.parse(fs.readFileSync(path.join(set, 'manifest.json'), 'utf8')).map((e) => [e.file.slice(0, -4), e]));
const times = fs.existsSync(path.join(dir, 'times.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'times.json'), 'utf8')).times : {};
const rows = list.filter((n) => fs.existsSync(path.join(dir, n + '.txt'))).map((n) => {
  const truth = fs.readFileSync(path.join(set, n + '.txt'), 'utf8'), read = fs.readFileSync(path.join(dir, n + '.txt'), 'utf8').replace(/<[^>]+>/g, ' '), w = wordsRight(truth, read);
  return { n, words: w.of, ok: w.ok, chars: charsRight(truth, read), s: times[n] ?? 0, tag: tags.get(n) };
});
const line = (label, r) => { const sum = (k) => r.reduce((a, x) => a + x[k], 0); return `${label.padEnd(30)}${String(r.length).padStart(4)} pages ${String(sum('words')).padStart(6)} words  ${(100 * sum('ok') / sum('words')).toFixed(1).padStart(5)} / ${(100 * sum('chars') / r.length).toFixed(1).padStart(5)}  ${(sum('s') / r.length).toFixed(1).padStart(6)} s/page`; };
console.log('slice                         pages  words    words right / chars right   seconds');
console.log(line('all', rows));
for (const dim of ['type', 'arrangement', 'scan']) { const g = new Map(); for (const r of rows) if (r.tag) (g.get(r.tag[dim]) ?? g.set(r.tag[dim], []).get(r.tag[dim])).push(r); for (const [k, r] of [...g].sort()) console.log(line(`${dim}: ${k}`, r)); }
if (process.argv.includes('--pages')) for (const r of rows) console.log(r.n.padEnd(34), (100 * r.ok / r.words).toFixed(1), (100 * r.chars).toFixed(1), r.s.toFixed(1));
