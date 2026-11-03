# Teacher run: reads page pictures with a vision-language OCR model on the GPU (PyTorch/CUDA, .venv-gpu).
#   .venv-gpu\Scripts\python -I tools\ocr-gpu\read_pages.py --model qari|qari4 --out DIR  page1.pdf page2.pdf ...
# Writes DIR/<name>.txt (the model's reading) and DIR/times.json (seconds a page). Score with tools/ocr-gpu/score.mjs.
# Measurement only - nothing here ships. Weights come from the Hugging Face cache (licences in README.md).
import argparse, json, os, sys, time
import fitz, torch
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('--model', required=True, choices=['qari', 'qari4'])
ap.add_argument('--out', required=True)
ap.add_argument('--long', type=int, default=1400, help='long side of the picture in pixels')
ap.add_argument('--lines', help='JSON list of {id, file}: line pictures instead of pages')
ap.add_argument('--batch', type=int, default=8)
ap.add_argument('pages', nargs='*')
a = ap.parse_args()
if not a.lines: os.makedirs(a.out, exist_ok=True)

def picture(path):
    if path.lower().endswith('.pdf'):
        p = fitz.open(path)[0]
        z = a.long / max(p.rect.width, p.rect.height)
        pix = p.get_pixmap(matrix=fitz.Matrix(z, z), colorspace=fitz.csRGB)
        return Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
    im = Image.open(path).convert('RGB'); s = a.long / max(im.size)
    return im.resize((round(im.width * s), round(im.height * s))) if s < 1 else im

PAGE_QARI = 'Below is the image of one page of a document, as well as some raw textual content that was previously extracted for it. Just return the plain text representation of this document as if you were reading it naturally. Do not hallucinate.'
LINE_QARI = 'This image is one line of printed Arabic text. Return exactly the text of the line, nothing else. Do not hallucinate.'
if a.model == 'qari':
    from transformers import Qwen2VLForConditionalGeneration, AutoProcessor
    rid = 'NAMAA-Space/Qari-OCR-v0.3-VL-2B-Instruct'
    model = Qwen2VLForConditionalGeneration.from_pretrained(rid, torch_dtype=torch.float16, device_map='cuda')
    proc = AutoProcessor.from_pretrained(rid); proc.tokenizer.padding_side = 'left'
    prompt = LINE_QARI if a.lines else PAGE_QARI; extra = {'repetition_penalty': 1.05}
else:  # Qari-OCR 0.4.0: a LoRA on Qwen3-VL-4B-Instruct, the base loaded in 4 bit so it fits next to the desktop in 8 GB
    from transformers import AutoModelForImageTextToText, AutoProcessor, BitsAndBytesConfig
    rid = 'NAMAA-Space/Qari-OCR-0.4.0-VL-4B-Instruct'
    model = AutoModelForImageTextToText.from_pretrained(rid, device_map='cuda', quantization_config=BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type='nf4', bnb_4bit_compute_dtype=torch.float16))
    proc = AutoProcessor.from_pretrained(rid); proc.tokenizer.padding_side = 'left'
    prompt = 'Free OCR.'; extra = {}  # the model card's prompt

def read(imgs, max_new):
    """One batch of pictures -> one text each (greedy)."""
    texts = [proc.apply_chat_template([{'role': 'user', 'content': [{'type': 'image', 'image': i}, {'type': 'text', 'text': prompt}]}], tokenize=False, add_generation_prompt=True) for i in imgs]
    inp = proc(text=texts, images=imgs, padding=True, return_tensors='pt').to('cuda')
    with torch.no_grad(): out = model.generate(**inp, max_new_tokens=max_new, do_sample=False, **extra)
    return [t.strip() for t in proc.batch_decode(out[:, inp['input_ids'].shape[1]:], skip_special_tokens=True)]

if a.lines:
    jobs = json.load(open(a.lines, encoding='utf8')); seen = set()
    if os.path.exists(a.out):
        ok = []
        for l in open(a.out, encoding='utf8'):
            try: ok.append(json.loads(l))
            except ValueError: pass  # a line cut short by a reboot: read again
        seen = {j['id'] for j in ok}
        with open(a.out, 'w', encoding='utf8') as o: o.writelines(json.dumps(j, ensure_ascii=False) + chr(10) for j in ok)
    jobs = [j for j in jobs if j['id'] not in seen]
    import random; random.Random(7).shuffle(jobs)  # any stopping point is an unbiased sample ...
    jobs = [j for i in range(0, len(jobs), 256) for j in sorted(jobs[i:i + 256], key=lambda j: j['w'])]  # ... and similar widths still batch together
    t0 = time.time()
    with open(a.out, 'a', encoding='utf8') as o:
        for i in range(0, len(jobs), a.batch):
            b = jobs[i:i + a.batch]
            try: txt = read([Image.open(j['file']).convert('RGB') for j in b], 120)
            except Exception as e: print('FAILED batch', i, repr(e)[:300], file=sys.stderr, flush=True); torch.cuda.empty_cache(); continue
            for j, t in zip(b, txt): o.write(json.dumps({'id': j['id'], 'text': t}, ensure_ascii=False) + chr(10))
            o.flush()
            if (i // a.batch) % 20 == 0: print(i + len(b), 'of', len(jobs), 'lines', round(time.time() - t0), 's', flush=True)
    sys.exit()

times = {}
for f in a.pages:
    name = os.path.splitext(os.path.basename(f))[0]
    t0 = time.time()
    try: txt = read([picture(f)], 2000)[0]
    except Exception as e: txt = ''; print('FAILED', name, repr(e)[:300], file=sys.stderr)
    times[name] = time.time() - t0
    open(os.path.join(a.out, name + '.txt'), 'w', encoding='utf8').write(txt)
    print(name, round(times[name], 1), 's', len(txt), 'chars', flush=True)
    json.dump({'times': times, 'vram_peak_gb': torch.cuda.max_memory_allocated() / 1e9}, open(os.path.join(a.out, 'times.json'), 'w'))
