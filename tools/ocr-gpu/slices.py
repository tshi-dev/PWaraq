# slices.py BASE.log NEW.log : per-slice words/chars/placed on the pages both logs have (tags from real/manifest.json)
import json, os, re, sys
man = {e['file'][:-4]: e for e in json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'tests', 'fixtures', 'ocr', 'real', 'manifest.json'), encoding='utf8'))}
def load(f):
    d = {}
    for l in open(f, encoding='utf8', errors='ignore'):
        m = re.match(r'^([msw]-\S+)\s+(\d+)\s+([\d.]+) %\s+([\d.]+) %\s+([\d.]+) %\s+[\d.]+ %.*?([\d.]+)\s*$', l)
        if m: d[m[1]] = (int(m[2]), float(m[3]), float(m[4]), float(m[5]), float(m[6]))
    return d
a, b = load(sys.argv[1]), load(sys.argv[2]); ks = [k for k in a if k in b]
def row(label, keys):
    if not keys: return
    W = sum(a[k][0] for k in keys); n = len(keys)
    f = lambda d: (sum(d[k][0]*d[k][1] for k in keys)/W, sum(d[k][2] for k in keys)/n, sum(d[k][3] for k in keys)/n, sum(d[k][4] for k in keys)/n)
    x, y = f(a), f(b)
    print(f'{label:34s}{n:4d} {W:6d} | {x[0]:5.1f} / {x[1]:5.1f} / {x[2]:5.1f} / {x[3]:5.1f} | {y[0]:5.1f} / {y[1]:5.1f} / {y[2]:5.1f} / {y[3]:5.1f} | {y[0]-x[0]:+5.1f}')
print('slice                             pages words | before: words / chars / placed / s | after | d words')
row('all', ks)
for dim in ('type', 'arrangement', 'scan'):
    vals = sorted({man[k][dim] for k in ks if k in man})
    for v in vals: row(f'{dim}: {v}', [k for k in ks if k in man and man[k][dim] == v])
