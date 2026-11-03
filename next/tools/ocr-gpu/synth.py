# synth.py GT_DIR OUT_DIR N [modern] : renders the silver labels' text as line pictures (text2image, Pango shaping) in several Arabic fonts with scan degradation
# modern: the fonts of today's Arabic office documents, from Windows (C:\Windows\Fonts via WSL), lighter degradation. The free fonts below
# (69 % of the mix, 29 Oct) made the model worse; the plain-page loss of the 2 Nov sweep is letter swaps on modern prints.
import glob, os, random, subprocess, sys, tempfile
from multiprocessing import Pool
from PIL import Image
src, out, n = sys.argv[1], sys.argv[2], int(sys.argv[3]); os.makedirs(out, exist_ok=True); modern = sys.argv[4:] == ['modern']
FONTS = ['Amiri', 'Noto Naskh Arabic', 'Noto Sans Arabic', 'Scheherazade New', 'KacstBook', 'KacstOffice', 'Tajawal', 'DejaVu Sans', 'Noto Kufi Arabic', 'Arab', 'Cortoba']
if modern: FONTS = ['Simplified Arabic', 'Simplified Arabic Bold', 'Traditional Arabic', 'Traditional Arabic Bold', 'Arial', 'Arial Bold', 'Times New Roman', 'Tahoma', 'Segoe UI', 'Sakkal Majalla', 'Arabic Typesetting', 'Dubai', 'Calibri', 'Microsoft Uighur', 'Andalus']
FONTS_DIR, DEGRADE = ('/mnt/c/Windows/Fonts', ['true', 'false']) if modern else ('/usr/share/fonts', ['true', 'true', 'false'])
texts = [open(f, encoding='utf8').read().strip() for f in sorted(glob.glob(src + '/*.gt.txt'))]
def one(i):
    r = random.Random(i); t = r.choice(texts); font = r.choice(FONTS); pt = r.choice([16, 20, 24, 28, 32])
    with tempfile.TemporaryDirectory() as d:
        open(d + '/t.txt', 'w', encoding='utf8').write(t + '\n')
        c = subprocess.run(['text2image', '--text=' + d + '/t.txt', '--outputbase=' + d + '/o', '--font=' + font, f'--ptsize={pt}', '--xsize=4000', '--ysize=400', '--margin=30', '--max_pages=1',
                            '--degrade_image=' + r.choice(DEGRADE), '--fonts_dir=' + FONTS_DIR, '--fontconfig_tmpdir=' + FC], capture_output=True)
        if not os.path.exists(d + '/o.tif'): return 0
        im = Image.open(d + '/o.tif').convert('L'); bb = Image.eval(im, lambda p: 255 - p).getbbox()
        if not bb: return 0
        h = bb[3] - bb[1]; pad = max(3, round(h * 0.02))
        im = im.crop((max(0, bb[0] - pad), max(0, bb[1] - pad), bb[2] + pad, bb[3] + pad))
        if im.height < 12 or im.width < 4 * im.height: return 0
        im.save(f'{out}/s{i:05d}.png'); open(f'{out}/s{i:05d}.gt.txt', 'w', encoding='utf8').write(t + '\n'); return 1
FC = '/tmp/synth-fc'   # one font cache for all lines (a fresh one per line re-scans the font folder: ~3 s a line on C:\Windows\Fonts)
if __name__ == '__main__':
    os.makedirs(FC, exist_ok=True); one(-1)   # builds the cache before the workers share it
    with Pool(16) as p: print(sum(p.map(one, range(n))), 'lines')
