// Fetches the SEPARATE pool of scanned Arabic pages for silver labels (never the test set):
//   node tools/ocr-gpu/get-pool.mjs [--every 5] [--work ../ocr-gpu-work]      → WORK/pool/pages/NNNN.jpg + pool.json
// Source: Hugging Face `freococo/ocr_arabic_books` (3537 scanned book pages, CC BY-NC-ND 4.0 per its dataset card: local
// training experiment only, nothing redistributed). The 8 rows the test set uses (tools/get-ocr-set.mjs) are skipped.
// Its page images come from the rows API at run time (links expire), so only dataset + row are recorded.
import fs from 'node:fs';
import path from 'node:path';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const work = path.resolve(import.meta.dirname, '..', '..', arg('work', '../ocr-gpu-work')), pages = path.join(work, 'pool', 'pages'), every = +arg('every', 5);
const TEST_ROWS = new Set([0, 450, 900, 1350, 1800, 2250, 2700, 3500]), DATASET = 'freococo/ocr_arabic_books';
fs.mkdirSync(pages, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fetchOk = async (url) => { for (let i = 0; ; i++) { const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } }); if (r.ok) return r; if (i > 6) throw new Error(url + ' → ' + r.status); await wait(1500 * 2 ** i); } };
const done = [];
for (let off = 0; off < 3537; off += 100) {
  const rows = (await (await fetchOk(`https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(DATASET)}&config=default&split=train&offset=${off}&length=100`)).json()).rows;
  for (const { row_idx, row } of rows) {
    if (TEST_ROWS.has(row_idx) || row_idx % every) continue;
    const f = path.join(pages, String(row_idx).padStart(4, '0') + '.jpg');
    if (!fs.existsSync(f)) fs.writeFileSync(f, Buffer.from(await (await fetchOk(row.image.src)).arrayBuffer()));
    done.push({ row: row_idx, file: path.basename(f), w: row.image.width, h: row.image.height });
  }
  console.log('rows', off, '→', done.length, 'pages');
}
fs.writeFileSync(path.join(work, 'pool', 'pool.json'), JSON.stringify({ dataset: DATASET, licence: 'CC BY-NC-ND 4.0 (dataset card)', pages: done }, null, 1));
