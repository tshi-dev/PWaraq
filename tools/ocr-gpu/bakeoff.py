# One-day bake-off (3 Nov 2026): Arabic PP-OCR (CPU, onnxruntime) and four image clean-ups, against stock Tesseract `ara`.
# CPU only, below-normal priority, nothing here touches the training folders. Run with `-I` from the repo root, in .venv-gpu:
#   python -I tools/ocr-gpu/bakeoff.py prep   B            # B = work folder (D:/ocr-bakeoff); needs B/stock/real/*.png from
#                                                           #   node tools/ocr-accuracy.mjs --only real/s,real/m,real/w --out B/stock
#   node tools/ocr-gpu/bakeoff-read.mjs B/pic/<variant> B/out/<variant> 250     (300 for up300; stock = B/stock/real, 250)
#   python -I tools/ocr-gpu/bakeoff.py ppocr  B NAME DET.onnx REC.onnx DICT.txt|REC.yml [--reverse] [--split RATIO] [--limit N]
#   python -I tools/ocr-gpu/bakeoff.py score  B NAME...    # words right / chars right per slice, with score.mjs (same comparison)
import ctypes, json, os, re, subprocess, sys, time
import numpy as np
from PIL import Image

ctypes.windll.kernel32.SetPriorityClass(ctypes.windll.kernel32.GetCurrentProcess(), 0x4000)  # BELOW_NORMAL: never slow the tune
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
MAN = json.load(open(os.path.join(ROOT, 'tests', 'fixtures', 'ocr', 'real', 'manifest.json'), encoding='utf8'))

# ---------- image clean-ups (on the picture the app already makes: grey, 250 dpi, cleaned) ----------
def box_mean(a, r):
    ii = np.pad(a.cumsum(0).cumsum(1), ((1, 0), (1, 0))); h, w = a.shape
    y0, y1 = np.clip(np.arange(h) - r, 0, h), np.clip(np.arange(h) + r + 1, 0, h)
    x0, x1 = np.clip(np.arange(w) - r, 0, w), np.clip(np.arange(w) + r + 1, 0, w)
    s = ii[y1][:, x1] - ii[y0][:, x1] - ii[y1][:, x0] + ii[y0][:, x0]
    return s / ((y1 - y0)[:, None] * (x1 - x0)[None, :])

def sauvola(g, r=25, k=0.2, R=128.0):
    a = g.astype(np.float64); m = box_mean(a, r); s = np.sqrt(np.maximum(box_mean(a * a, r) - m * m, 0))
    return np.where(a > m * (1 + k * (s / R - 1)), 255, 0).astype(np.uint8)

def otsu(v):
    hist = np.bincount(v.ravel(), minlength=256).astype(np.float64); tot = hist.sum(); sb, wb, best, t = 0.0, 0.0, -1.0, 128
    sm = (hist * np.arange(256)).sum()
    for i in range(256):
        wb += hist[i]
        if wb == 0 or wb == tot: continue
        sb += i * hist[i]; mb, mf = sb / wb, (sm - sb) / (tot - wb); b = wb * (tot - wb) * (mb - mf) ** 2
        if b > best: best, t = b, i
    return t

def otsu_adaptive(g, tile=128):
    g0 = otsu(g); H, W = g.shape; ny, nx = -(-H // tile), -(-W // tile); th = np.full((ny, nx), float(g0), np.float32)
    for i in range(ny):
        for j in range(nx):
            t = g[i * tile:(i + 1) * tile, j * tile:(j + 1) * tile]
            if t.std() > 12: th[i, j] = otsu(t)  # a flat tile (blank margin) keeps the page threshold
    big = Image.fromarray(th, 'F').resize((nx * tile, ny * tile), Image.BILINEAR)
    return np.where(g > np.asarray(big)[:H, :W], 255, 0).astype(np.uint8)

def deskew(g):  # projection-profile search, +-3 degrees, a tilt under 0.1 degree is left alone
    ink = Image.fromarray(np.where(g < otsu(g), 255, 0).astype(np.uint8)).reduce(2)
    score = lambda a: np.var(np.asarray(ink.rotate(a, Image.BILINEAR)).sum(1, dtype=np.float64))
    best = max(np.arange(-3, 3.01, 0.5), key=score); best = max(np.arange(best - 0.5, best + 0.51, 0.1), key=score)
    if abs(best) < 0.1 or score(best) <= 1.05 * score(0): return g, 0.0  # a blank page or no clear gain: leave it (ties picked -3 before)
    return np.asarray(Image.fromarray(g).rotate(best, Image.BICUBIC, fillcolor=255)), best

def up300(g): return np.asarray(Image.fromarray(g).resize((round(g.shape[1] * 1.2), round(g.shape[0] * 1.2)), Image.LANCZOS))

def prep(B):
    src = os.path.join(B, 'stock', 'real'); names = sorted(f[:-4] for f in os.listdir(src) if f.endswith('.png'))
    fns = {'sauvola': sauvola, 'otsuad': otsu_adaptive, 'deskew': lambda g: deskew(g)[0], 'up300': up300}
    for v in fns: os.makedirs(os.path.join(B, 'pic', v), exist_ok=True)
    for n in names:
        g = np.asarray(Image.open(os.path.join(src, n + '.png')).convert('L'))
        for v, f in fns.items():
            p = os.path.join(B, 'pic', v, n + '.png')
            if not os.path.exists(p): Image.fromarray(np.ascontiguousarray(f(g))).save(p)
    print(len(names), 'pages x', list(fns))

# ---------- PP-OCR: DB detector -> line crops -> CTC recogniser, onnxruntime on the CPU ----------
def session(p):
    import onnxruntime as ort
    o = ort.SessionOptions(); o.intra_op_num_threads = 2; o.log_severity_level = 3
    return ort.InferenceSession(p, o, providers=['CPUExecutionProvider'])

def load_dict(p):
    if p.endswith('.yml'):
        import yaml; ch = yaml.safe_load(open(p, encoding='utf8'))['PostProcess']['character_dict']
    else: ch = open(p, encoding='utf8').read().split('\n')
    return [''] + [str(c) for c in ch if c != ''] + [' ']  # index 0 = CTC blank; use_space_char adds the space last

def pred_reverse(s):  # PaddleOCR's own rule for dicts named *arabic*: the net reads visually, runs of Latin/digits stay as they are
    out, cur = [], ''
    for c in s:
        if re.search('[a-zA-Z0-9 :*./%+-]', c): cur += c
        else:
            if cur: out.append(cur)
            out.append(c); cur = ''
    if cur: out.append(cur)
    return ''.join(out[::-1])

def components(p, thr):  # 8-connected blobs of p > thr from row runs and union-find (no scipy here): [(x0, y0, x1, y1, mean p)]
    par, runs, prev = [], [], []
    def find(i):
        while par[i] != i: par[i] = par[par[i]]; i = par[i]
        return i
    for y in range(p.shape[0]):
        m = (p[y] > thr).astype(np.int8); d = np.diff(np.concatenate(([0], m, [0]))); st, en = np.flatnonzero(d == 1), np.flatnonzero(d == -1)
        cs = np.concatenate(([0.0], np.cumsum(p[y], dtype=np.float64))); cur = []
        for a, b in zip(st.tolist(), en.tolist()):
            i = len(par); par.append(i); runs.append((y, a, b, cs[b] - cs[a])); cur.append((i, a, b))
        j = 0
        for i, a, b in cur:
            while j < len(prev) and prev[j][2] < a: j += 1  # previous-row runs ending left of this one (touching diagonally counts)
            k = j
            while k < len(prev) and prev[k][1] <= b: par[find(prev[k][0])] = find(i); k += 1
        prev = cur
    acc = {}
    for i, (y, a, b, s) in enumerate(runs):
        r = find(i); o = acc.get(r)
        acc[r] = [a, y, b, y + 1, s, b - a] if o is None else [min(o[0], a), min(o[1], y), max(o[2], b), y + 1, o[4] + s, o[5] + b - a]
    return [(o[0], o[1], o[2], o[3], o[4] / o[5]) for o in acc.values()]

def detect(sess, g, maxside=2560):
    H, W = g.shape; s = min(1.0, maxside / max(H, W)); h, w = max(32, round(H * s / 32) * 32), max(32, round(W * s / 32) * 32)
    x = np.asarray(Image.fromarray(g).convert('RGB').resize((w, h), Image.BILINEAR), np.float32) / 255
    x = ((x - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]).transpose(2, 0, 1)[None].astype(np.float32)
    p = sess.run(None, {sess.get_inputs()[0].name: x})[0][0, 0]; boxes = []
    for x0, y0, x1, y1, sc in components(p, 0.3):
        bh, bw = y1 - y0, x1 - x0
        if min(bh, bw) < 3 or sc < 0.6: continue
        d = bh * bw * 1.5 / (2 * (bh + bw))  # DB's unclip: grow the shrunk region by area * ratio / perimeter
        boxes.append((max(0, (x0 - d) * W / w), max(0, (y0 - d) * H / h), min(W, (x1 + d) * W / w), min(H, (y1 + d) * H / h)))
    return boxes

def split_box(g, box, ratio):  # the recogniser was trained on lines of <= 25 characters: cut a long box at blank columns into pieces <= ratio x height wide
    x0, y0, x1, y1 = (int(round(v)) for v in box); h = y1 - y0
    if not ratio or h < 8 or x1 - x0 <= ratio * h: return [box]
    c = g[y0:y1, x0:x1]; ink = (c < otsu(c)).sum(0) == 0; out, a, W = [], 0, int(ratio * h)
    while len(c[0]) - a > W:
        lo, hi = a + W // 2, a + W; gaps = np.flatnonzero(ink[lo:hi]) + lo
        cut = int(gaps[len(gaps) // 2]) if len(gaps) else hi  # a blank column in the second half of the window, else a hard cut
        out.append((x0 + a, y0, x0 + cut, y1)); a = cut
    return out + [(x0 + a, y0, x1, y1)]

def recognise(sess, chars, g, box, reverse):
    x0, y0, x1, y1 = (int(round(v)) for v in box); c = g[y0:y1, x0:x1]
    if c.size == 0: return ''
    w = int(np.clip(np.ceil(48 * c.shape[1] / c.shape[0]), 16, 3200))
    a = np.asarray(Image.fromarray(c).convert('RGB').resize((w, 48), Image.BILINEAR), np.float32) / 255
    a = ((a - 0.5) / 0.5).transpose(2, 0, 1)[None].astype(np.float32)
    ids = sess.run(None, {sess.get_inputs()[0].name: a})[0][0].argmax(-1); out, last = [], 0
    for i in ids:
        if i != last and i != 0 and i < len(chars): out.append(chars[i])
        last = i
    t = ''.join(out)
    return pred_reverse(t) if reverse else t

def ppocr(B, name, det, rec, dic, reverse, limit, split=0):
    d, r, chars = session(det), session(rec), load_dict(dic); out = os.path.join(B, 'out', name); os.makedirs(out, exist_ok=True)
    tj = os.path.join(out, 'times.json'); times = json.load(open(tj))['times'] if os.path.exists(tj) else {}
    src = os.path.join(B, 'stock', 'real'); names = sorted(f[:-4] for f in os.listdir(src) if f.endswith('.png'))
    for n in names[:limit] if limit else names:
        if os.path.exists(os.path.join(out, n + '.txt')): continue
        t0 = time.time(); g = np.asarray(Image.open(os.path.join(src, n + '.png')).convert('L'))
        boxes = sorted(detect(d, g), key=lambda b: ((b[1] + b[3]) / 2, -b[2]))  # top to bottom; the metric ignores order anyway
        open(os.path.join(out, n + '.txt'), 'w', encoding='utf8').write('\n'.join(recognise(r, chars, g, c, reverse) for b in boxes for c in split_box(g, b, split)) + '\n')
        times[n] = time.time() - t0; json.dump({'times': times}, open(tj, 'w'))

# ---------- scoring: score.mjs (same comparison as ocr-accuracy.mjs) on four slices ----------
def slices():
    s = {'all': [], 'plain modern': [], 'vowelled': [], 'old books': [], 'historical': []}
    for e in MAN:
        n = e['file'][:-4]; s['all'].append(n)
        if e['arrangement'] == 'plain' and e['scan'] == 'Misraj-DocOCR': s['plain modern'].append(n)
        if e['arrangement'] == 'full tashkeel': s['vowelled'].append(n)
        if e['scan'] == 'ocr_arabic_books': s['old books'].append(n)  # the 8 book pages of the 29 Oct review
        if e['scan'] in ('arocrbench_historicalbooks', 'Wikisource 1931'): s['historical'].append(n)
    return s

def score(B, names):
    sl = slices(); rows = {}
    for nm in names:
        d = os.path.join(B, 'stock', 'real') if nm == 'stock-harness' else os.path.join(B, 'out', nm); rows[nm] = {}
        for k, v in sl.items():
            lst = os.path.join(B, f'slice-{k.replace(" ", "_")}.txt'); open(lst, 'w').write('\n'.join(v))
            o = subprocess.run(['node', os.path.join(HERE, 'score.mjs'), d, '--list', lst], capture_output=True, text=True, cwd=ROOT).stdout
            m = re.search(r'^all\s+(\d+) pages\s+(\d+) words\s+([\d.]+)\s*/\s*([\d.]+)', o, re.M)
            rows[nm][k] = (int(m[1]), int(m[2]), float(m[3]), float(m[4])) if m else None
    print('| method | ' + ' | '.join(f'{k} ({len(v)})' for k, v in sl.items()) + ' |\n|---|' + '---|' * len(sl))
    for nm, r in rows.items(): print(f'| {nm} | ' + ' | '.join(f'{x[2]:.1f} / {x[3]:.1f}' if x else '-' for x in r.values()) + ' |')
    json.dump(rows, open(os.path.join(B, 'scores.json'), 'w'), indent=1)

if __name__ == '__main__':
    a = sys.argv[1:]
    if a[0] == 'prep': prep(a[1])
    elif a[0] == 'ppocr':
        lim = int(a[a.index('--limit') + 1]) if '--limit' in a else 0
        ppocr(a[1], a[2], a[3], a[4], a[5], '--reverse' in a, lim, float(a[a.index('--split') + 1]) if '--split' in a else 0)
    elif a[0] == 'score': score(a[1], a[2:])
