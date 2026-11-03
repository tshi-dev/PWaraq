// Bake-off helper: reads picture files with the app's Tesseract (tesseract.js, public/ocr/ara + eng, same settings and the same
// linesOf() as tools/ocr-accuracy.mjs, one plain recognise per picture) and writes OUT/<name>.txt.
//   node tools/ocr-gpu/bakeoff-read.mjs IN_DIR OUT_DIR DPI [--shard i/n] [--ara ara|ara_best]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { linesOf } from '../../src/lib/ocr.ts';

const [inDir, outDir, dpi] = process.argv.slice(2), root = path.join(import.meta.dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const [si, sn] = arg('shard', '0/1').split('/').map(Number), ara = arg('ara', 'ara');
fs.mkdirSync(outDir, { recursive: true });
const files = fs.readdirSync(inDir).filter((f) => f.endsWith('.png')).sort().filter((_, i) => i % sn === si);
const T = createRequire(import.meta.url)('tesseract.js');
const w = await T.createWorker(`${ara}+eng`, 1, { langPath: path.join(root, 'public', 'ocr'), gzip: true, cacheMethod: 'none' });
await w.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '1', user_defined_dpi: String(dpi) });
for (const f of files) {
  const out = path.join(outDir, f.slice(0, -4) + '.txt');
  if (fs.existsSync(out)) continue; // re-runnable
  const lines = linesOf((await w.recognize(fs.readFileSync(path.join(inDir, f)), {}, { blocks: true })).data);
  fs.writeFileSync(out, lines.map((l) => l.words.map((x) => x.text).join(' ')).join('\n') + '\n');
}
await w.terminate();
