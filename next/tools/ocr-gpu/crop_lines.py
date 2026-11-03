# Cuts the line pictures out of the pool pages (boxes from split-lines.mjs) in tesstrain's layout:
#   .venv-gpu\Scripts\python -I tools\ocr-gpu\crop_lines.py WORK     → WORK/pool/lines/NNNN_LL.png (grey) + WORK/pool/lines.list.json
import json, os, re, sys
from PIL import Image
work = sys.argv[1]; pool = os.path.join(work, 'pool')
PAD = float(sys.argv[2]) if len(sys.argv) > 2 else 0.25; NAME = sys.argv[3] if len(sys.argv) > 3 else 'lines'  # padding as a share of the line height; folder/list name
os.makedirs(os.path.join(pool, NAME), exist_ok=True)
jobs = []
listf = os.path.join(pool, NAME + '.list.json')
known = {j['id']: (j['w'], j['h']) for j in json.load(open(listf, encoding='utf8'))} if os.path.exists(listf) else {}  # sizes of crops cut in an earlier round
for p in json.load(open(os.path.join(pool, 'lines.json'), encoding='utf8')):
    im = None  # opened only when one of its crops is missing (the unattended run crops again every round)
    for k, l in enumerate(p['lines']):
        if l['x1'] - l['x0'] < 250 or len(re.findall(r'[ء-ي]', l['tess'])) < 12: continue  # specks, page numbers, ornaments
        pad = max(3, round((l['y1'] - l['y0']) * PAD))
        id = f"{p['page'][:-4]}_{k:02d}"; f = os.path.join(pool, NAME, id + '.png')
        if id in known and os.path.exists(f): w, h = known[id]
        else:
            if im is None: im = Image.open(os.path.join(pool, 'pages', p['page'])).convert('L')
            c = im.crop((max(0, l['x0'] - pad), max(0, l['y0'] - pad), min(im.width, l['x1'] + pad), min(im.height, l['y1'] + pad))); c.save(f); w, h = c.size
        jobs.append({'id': id, 'file': f, 'w': w, 'h': h, 'tess': l['tess']})
json.dump(jobs, open(os.path.join(pool, NAME + '.list.json'), 'w', encoding='utf8'), ensure_ascii=False)
print(len(jobs), 'lines')
