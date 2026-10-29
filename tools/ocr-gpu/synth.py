# synth.py GT_DIR OUT_DIR N : renders the silver labels' text as line pictures (text2image, Pango shaping) in several Arabic fonts with scan degradation
import glob, os, random, subprocess, sys, tempfile
from multiprocessing import Pool
from PIL import Image
src, out, n = sys.argv[1], sys.argv[2], int(sys.argv[3]); os.makedirs(out, exist_ok=True)
FONTS = ['Amiri', 'Noto Naskh Arabic', 'Noto Sans Arabic', 'Scheherazade New', 'KacstBook', 'KacstOffice', 'Tajawal', 'DejaVu Sans', 'Noto Kufi Arabic', 'Arab', 'Cortoba']
texts = [open(f, encoding='utf8').read().strip() for f in sorted(glob.glob(src + '/*.gt.txt'))]
def one(i):
    r = random.Random(i); t = r.choice(texts); font = r.choice(FONTS); pt = r.choice([16, 20, 24, 28, 32])
    with tempfile.TemporaryDirectory() as d:
        open(d + '/t.txt', 'w', encoding='utf8').write(t + '\n')
        c = subprocess.run(['text2image', '--text=' + d + '/t.txt', '--outputbase=' + d + '/o', '--font=' + font, f'--ptsize={pt}', '--xsize=4000', '--ysize=400', '--margin=30', '--max_pages=1',
                            '--degrade_image=' + r.choice(['true', 'true', 'false']), '--fonts_dir=/usr/share/fonts', '--fontconfig_tmpdir=' + d], capture_output=True)
        if not os.path.exists(d + '/o.tif'): return 0
        im = Image.open(d + '/o.tif').convert('L'); bb = Image.eval(im, lambda p: 255 - p).getbbox()
        if not bb: return 0
        h = bb[3] - bb[1]; pad = max(3, round(h * 0.02))
        im = im.crop((max(0, bb[0] - pad), max(0, bb[1] - pad), bb[2] + pad, bb[3] + pad))
        if im.height < 12 or im.width < 4 * im.height: return 0
        im.save(f'{out}/s{i:05d}.png'); open(f'{out}/s{i:05d}.gt.txt', 'w', encoding='utf8').write(t + '\n'); return 1
if __name__ == '__main__':
    with Pool(16) as p: print(sum(p.map(one, range(n))), 'lines')
