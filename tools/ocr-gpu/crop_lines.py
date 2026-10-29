# Cuts the line pictures out of the pool pages (boxes from split-lines.mjs) in tesstrain's layout:
#   .venv-gpu\Scripts\python -I tools\ocr-gpu\crop_lines.py WORK     → WORK/pool/lines/NNNN_LL.png (grey) + WORK/pool/lines.list.json
import json, os, re, sys
from PIL import Image
work = sys.argv[1]; pool = os.path.join(work, 'pool'); os.makedirs(os.path.join(pool, 'lines'), exist_ok=True)
jobs = []
for p in json.load(open(os.path.join(pool, 'lines.json'), encoding='utf8')):
    im = Image.open(os.path.join(pool, 'pages', p['page'])).convert('L')
    for k, l in enumerate(p['lines']):
        if l['x1'] - l['x0'] < 250 or len(re.findall(r'[ء-ي]', l['tess'])) < 12: continue  # specks, page numbers, ornaments
        pad = max(4, round((l['y1'] - l['y0']) * 0.25))
        c = im.crop((max(0, l['x0'] - pad), max(0, l['y0'] - pad), min(im.width, l['x1'] + pad), min(im.height, l['y1'] + pad)))
        id = f"{p['page'][:-4]}_{k:02d}"; f = os.path.join(pool, 'lines', id + '.png'); c.save(f)
        jobs.append({'id': id, 'file': f, 'w': c.width, 'h': c.height, 'tess': l['tess']})
json.dump(jobs, open(os.path.join(pool, 'lines.list.json'), 'w', encoding='utf8'), ensure_ascii=False)
print(len(jobs), 'lines')
