// More pool pages: scans of the works Arabic Wikisource indexes (its "فهرس:" namespace), from Wikimedia Commons, only files whose
// Commons licence is exactly "Public domain" (checked per file). Never the test set's Wikisource work.
//   node tools/ocr-gpu/get-commons.mjs [--pages 10000] [--per 60] [--work ../ocr-gpu-work]  → WORK/pool/pages/c-FFFF-PPPP.jpg + WORK/pool/commons.json
// Resumable (existing pictures are kept). Polite: one request at a time, a pause between them, retries on 429.
import fs from 'node:fs';
import path from 'node:path';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const work = path.resolve(import.meta.dirname, '..', '..', arg('work', '../ocr-gpu-work')), pages = path.join(work, 'pool', 'pages'), want = +arg('pages', 10000), per = +arg('per', 60);
const TEST_WORK = 'ابن الرومي - حياته من شعره (1931) - العقاد.pdf'; // w-01 of the test set (tools/get-ocr-set.mjs)
fs.mkdirSync(pages, { recursive: true });
const UA = { headers: { 'user-agent': 'WaraqOcrTraining/1.0 (local OCR research, github.com/tshi-dev/PWaraq)' } }, wait = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (url, json = true) => { for (let i = 0; ; i++) { await wait(800); try { const r = await fetch(url, { ...UA, signal: AbortSignal.timeout(60000) }); if (r.ok) return json ? r.json() : Buffer.from(await r.arrayBuffer()); if (r.status >= 400 && r.status < 500 && r.status !== 429 || i > 6) throw new Error(url + ' → ' + r.status); } catch (e) { if (i > 6) throw e; } await wait(3000 * 2 ** i); } };
const api = (host, p) => get(`https://${host}/w/api.php?format=json&${p}`);
const listFile = path.join(work, 'pool', 'commons.json');
let files = fs.existsSync(listFile) ? JSON.parse(fs.readFileSync(listFile, 'utf8')).files : null;
if (!files) { // every indexed work, then its Commons licence and page count, 10 titles a call (long Arabic titles: the server refuses long addresses)
  const titles = []; let cont = '';
  do { const r = await api('ar.wikisource.org', `action=query&list=allpages&apnamespace=106&aplimit=500${cont}`); titles.push(...r.query.allpages.map((x) => x.title.replace(/^[^:]+:/, ''))); cont = r.continue ? `&apcontinue=${encodeURIComponent(r.continue.apcontinue)}` : ''; } while (cont);
  files = [];
  for (let i = 0; i < titles.length; i += 10) {
    const r = await api('commons.wikimedia.org', `action=query&prop=imageinfo&iiprop=size|extmetadata|mime&iiextmetadatafilter=LicenseShortName&titles=${encodeURIComponent(titles.slice(i, i + 10).map((t) => 'File:' + t).join('|'))}`);
    if (i % 200 === 0) console.log('licences checked', i, 'of', titles.length);
    for (const p of Object.values(r.query?.pages ?? {})) {
      const ii = p.imageinfo?.[0], name = p.title.replace(/^File:/, '');
      if (ii && /pdf|djvu/.test(ii.mime) && ii.pagecount > 4 && ii.extmetadata?.LicenseShortName?.value === 'Public domain' && name !== TEST_WORK) files.push({ name, pages: ii.pagecount, licence: 'Public domain' });
    }
  }
  files.sort((a, b) => a.name.localeCompare(b.name)).forEach((f, i) => (f.id = i));
  fs.writeFileSync(listFile, JSON.stringify({ source: 'Wikimedia Commons, works indexed by ar.wikisource.org', files }, null, 1));
}
console.log(files.length, 'public-domain works,', files.reduce((a, f) => a + f.pages, 0), 'pages in all');
// a spread of pages from every work (covers and the last pages skipped), round-robin so any stopping point is varied
const plan = files.map((f) => { const lo = Math.min(10, f.pages - 1), n = Math.min(per, f.pages - lo), step = (f.pages - lo) / n; return Array.from({ length: n }, (_, k) => ({ f, page: lo + 1 + Math.floor(k * step) })); });
let got = 0; const bad = new Set(); // a work that failed once is skipped for the rest of the run (its retries cost minutes on every pass)
for (let k = 0; got < want && plan.some((p) => p.length > k); k++) for (const p of plan) {
  if (got >= want) break;
  const e = p[k]; if (!e || bad.has(e.f.name)) continue;
  const out = path.join(pages, `c-${String(e.f.id).padStart(4, '0')}-${String(e.page).padStart(4, '0')}.jpg`);
  if (!fs.existsSync(out)) { try { fs.writeFileSync(out, await get(`https://commons.wikimedia.org/w/thumb.php?f=${encodeURIComponent(e.f.name)}&page=${e.page}&width=1600`, false)); } catch (err) { bad.add(e.f.name); console.log('skip', e.f.name, e.page, err.message); continue; } }
  if (++got % 200 === 0) console.log(got, 'pages');
}
console.log('done:', got, 'pages');
