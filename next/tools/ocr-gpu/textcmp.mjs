// The text comparison of tools/ocr-accuracy.mjs (tashkeel, tatweel and punctuation ignored, lam-alef either way, digits unified),
// shared by score.mjs and agree.mjs.
const digit = (d) => String('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹'.indexOf(d) % 10);
export const norm = (s) => s.normalize('NFC').replace(/[ً-ْٰـ]/g, '').replace(/([اأإآ])ل/g, 'ل$1').replace(/[٠-٩۰-۹]/g, digit)
  .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/(\p{N})(?=\p{L})|(\p{L})(?=\p{N})/gu, '$1$2 ').replace(/\s+/g, ' ').trim();
export const wordsRight = (truth, read) => { const have = new Map(); for (const w of norm(read).split(' ')) have.set(w, (have.get(w) ?? 0) + 1); let ok = 0; const t = norm(truth).split(' '); for (const w of t) if (have.get(w)) { ok++; have.set(w, have.get(w) - 1); } return { ok, of: t.length }; };
export const editDistance = (a, b) => { let prev = Array.from({ length: b.length + 1 }, (_, i) => i), cur = new Array(b.length + 1); for (let i = 1; i <= a.length; i++) { cur[0] = i; for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); [prev, cur] = [cur, prev]; } return prev[b.length]; };
export const charsRight = (truth, read) => { const t = [...norm(truth)], r = [...norm(read)]; return Math.max(0, 1 - editDistance(t, r) / t.length); };
