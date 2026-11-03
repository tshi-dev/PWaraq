# verdict.py BASE.log NEW.log : the keep rule as code. KEEP only if, on the pages both logs have, words right beat the base overall,
# no slice (type / arrangement / scan) loses more than 1 point of words right, and placement stays >= 95 % (mean).
# Prints the slice table (same as slices.py) and a last line "VERDICT: KEEP|DROP - reason". Exit code 0 = keep, 1 = drop.
import json, os, re, sys
here = os.path.dirname(os.path.abspath(__file__))
man = {e['file'][:-4]: e for e in json.load(open(os.path.join(here, '..', '..', 'tests', 'fixtures', 'ocr', 'real', 'manifest.json'), encoding='utf8'))}
def load(f):
    d = {}
    for l in open(f, encoding='utf8', errors='ignore'):
        m = re.match(r'^([msw]-\S+)\s+(\d+)\s+([\d.]+) %\s+([\d.]+) %\s+([\d.]+) %', l)
        if m: d[m[1]] = (int(m[2]), float(m[3]), float(m[4]), float(m[5]))
    return d
a, b = load(sys.argv[1]), load(sys.argv[2]); ks = [k for k in a if k in b]
if not ks: print('VERDICT: DROP - no pages in common'); sys.exit(1)
def stat(d, keys):
    W = sum(a[k][0] for k in keys)
    return sum(a[k][0] * d[k][1] for k in keys) / W, sum(d[k][2] for k in keys) / len(keys), sum(d[k][3] for k in keys) / len(keys)
rows = [('all', ks)] + [(f'{dim}: {v}', [k for k in ks if k in man and man[k][dim] == v]) for dim in ('type', 'arrangement', 'scan') for v in sorted({man[k][dim] for k in ks if k in man})]
worst = (0, '')
print(f'{"slice":34s}{"pages":>5} | stock words/chars/placed | new | d words')
for label, keys in rows:
    if not keys: continue
    x, y = stat(a, keys), stat(b, keys); d = y[0] - x[0]
    print(f'{label:34s}{len(keys):5d} | {x[0]:5.1f} / {x[1]:5.1f} / {x[2]:5.1f} | {y[0]:5.1f} / {y[1]:5.1f} / {y[2]:5.1f} | {d:+5.1f}')
    if label != 'all' and d < worst[0]: worst = (d, label)
allx, ally = stat(a, ks), stat(b, ks)
why = []
if ally[0] <= allx[0]: why.append(f'overall words {ally[0]:.1f} <= stock {allx[0]:.1f}')
if worst[0] < -1: why.append(f'slice "{worst[1]}" drops {worst[0]:.1f}')
if ally[2] < 95: why.append(f'placement {ally[2]:.1f} < 95')
print('VERDICT: ' + ('DROP - ' + '; '.join(why) if why else f'KEEP - words {ally[0]:.1f} vs {allx[0]:.1f}, worst slice {worst[0]:+.1f}'))
sys.exit(1 if why else 0)
