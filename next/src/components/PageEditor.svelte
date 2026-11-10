<script lang="ts" module>
  export type Saved = { doc: number; w: number; h: number; bytes: Uint8Array };
</script>

<script lang="ts">
  // The page editor (like Acrobat's Edit PDF / PDFCraft): the page large in the middle, tools on top, options on the
  // right, no pop-ups. Text is added as real text (Tajawal), a replaced line in its own font; photos are added, moved, resized, replaced or
  // deleted. Save makes the edited page a new one-page source that takes the old page's place (View, Organize, Portfolio).
  import { onMount, tick } from 'svelte';
  import type { EnginePool } from '../lib/engine/pool';
  import type { Item } from '../lib/engine/assemble';
  import { LEADING, BASELINE, type Box, type Edit, type PageLine } from '../lib/engine/editpage';
  import { i18n, t, type Key } from '../lib/i18n.svelte';
  import { icon } from '../lib/icons.js';
  import { pickFiles } from '../lib/store';
  import { isDesktop, readPath } from '../lib/desktop';
  import { WINDOWS_FONTS } from '../lib/engine/fontstore';
  import { uid } from '../lib/pages';
  import { ctrlWheel, autoScroll } from '../lib/touch';
  import Sheet from './Sheet.svelte';
  import ScopeTabs from './ScopeTabs.svelte';
  import { view } from '../lib/device.svelte';
  import { restack, type To } from '../lib/selection';

  let { pool, base, label, onSave, onCancel, scope = $bindable() }: { pool: EnginePool; base: Item; label: string; onSave: (r: Saved) => void | Promise<void>; onCancel: () => void; scope?: 'page' | 'document' } = $props();

  // what the editor holds: the engine's edits plus an id; `orig` = the state it was lifted with (unchanged ones are dropped)
  // `no`: the number in the layer's name (Moved area 2); `hidden` (below) is view only and not part of the edits
  type Obj = Edit & { id: string; orig?: string; line?: number; removed?: boolean; aligned?: boolean; no?: number };
  const made = { move: 0, redact: 0, photo: 0 };
  let hidden = $state<Record<string, boolean>>({}), sheetOpen = $state(false);
  let doc = $state(-1), size = $state({ w: 595, h: 842 }), found = $state<{ lines: PageLine[]; images: Box[] }>({ lines: [], images: [] });
  // the selection (`chosen`): editor objects by id, the page's own lines and pictures not lifted yet as 'line:3' / 'pic:2';
  // `selected` / `sel`: the one object when exactly one is chosen (its own options, handles and font check)
  let objs = $state<Obj[]>([]), chosen = $state<string[]>([]), tool = $state<'select' | 'text' | 'redact' | 'move'>('select'), busy = $state(t('openingPage'));
  const selected = $derived(chosen.length === 1 ? chosen[0] : null), sel = $derived(objs.find((o) => o.id === selected));
  const isOn = (k: string) => chosen.includes(k);
  let several = $state(false); // touch: "Select several" makes taps add to the selection and a finger drag draw a selection box
  const additive = (e: MouseEvent) => e.ctrlKey || e.metaKey || e.shiftKey || several;
  let sheet = $state<HTMLElement>();
  // photos in the order they are offered to the pointer: the biggest first, so the smallest one under it ends up on top and wins
  const byArea = $derived(found.images.map((_, i) => i).sort((a, b) => found.images[b].w * found.images[b].h - found.images[a].w * found.images[a].h));
  // a replaced line: the font it will be written in (its own, or the closest bundled one and the letters that were missing)
  let fontInfo = $state<{ font: string; using: string | null; missing: string[]; reason?: 'own' | 'missing' | 'unusable' | 'none'; source?: 'pdf' | 'bundled' | 'system'; width?: number } | null>(null);
  const systemTried = new Set<string>(); // families this sitting already looked for on this PC
  $effect(() => {
    const o = sel;
    if (o?.kind !== 'text' || !o.from || !o.text.trim()) { fontInfo = null; return; }
    const args = { doc, page: 0, from: $state.snapshot(o.from), text: o.text, bold: o.bold, size: o.size };
    const timer = setTimeout(() => pool.run<typeof fontInfo>({ op: 'fontcheck', page: 0, priority: 0, args }).then(async (f) => {
      fontInfo = f;
      // desktop: a line whose own copy of the font cannot be reused gets the whole font from this PC when it has it
      if (f?.using && f.source !== 'system' && isDesktop && !systemTried.has(f.font)) {
        systemTried.add(f.font);
        const file = WINDOWS_FONTS[f.font.toLowerCase().replace(/[^a-z]/g, '')]?.[o.bold ? 1 : 0] ?? WINDOWS_FONTS[f.font.toLowerCase().replace(/[^a-z]/g, '')]?.[0];
        if (file) try {
          const bytes = new Uint8Array(await (await readPath('C:/Windows/Fonts/' + file)).arrayBuffer());
          await pool.run({ op: 'addfont', page: 0, priority: 0, args: { name: f.font, bytes } });
          fontInfo = await pool.run<typeof fontInfo>({ op: 'fontcheck', page: 0, priority: 0, args });
        } catch (e) { console.warn('system font:', e); }
      }
    }).catch((e) => console.warn('font check:', e)), 200);
    return () => clearTimeout(timer);
  });
  const fontText = (f: NonNullable<typeof fontInfo>) => (!f.using ? t('fontOwn') : f.source === 'system' ? t('fontSystem') : f.reason === 'missing' && f.missing.length ? t('fontMissing') : t('fontUnusable'))
    .replace('{font}', f.font || '?').replace('{using}', f.using ?? '').replace('{letters}', f.missing.join(' '));
  // the editing box in the font the line will be written in (a system font by name when the browser has it, else the bundled family)
  const family = (o: Obj) => {
    const own = o.line != null ? found.lines[o.line]?.font : '', name = (o.id === selected && fontInfo ? (fontInfo.using ?? fontInfo.font) : own) ?? '';
    return /^[A-Za-z0-9 -]+$/.test(name.trim()) ? `'${name.trim().replace(/ Bold$/, '')}', Tajawal, sans-serif` : 'Tajawal, sans-serif';
  };
  const photos: Uint8Array[] = [];
  let urls = $state<string[]>([]);

  onMount(() => {
    (async () => {
      try {
        const a = await pool.add(await pool.build({ items: [base] }));
        size = a.sizes[0];
        found = await pool.run({ op: 'objects', page: 0, priority: 0, args: { doc: a.id, page: 0 } });
        doc = a.id;
      } catch { onCancel(); }
      busy = '';
    })();
    measure();
    return () => { urls.forEach((u) => URL.revokeObjectURL(u)); if (clean) URL.revokeObjectURL(clean); Object.values(pics).forEach((u) => URL.revokeObjectURL(u)); };
  });

  // the page fills the middle; s = screen pixels per point
  let sw = $state(0), sh = $state(0);
  // zoom: 0 = the page fits the window; otherwise points shown as that many pixels (1 = 100 %), the stage scrolls
  let zoom = $state(0);
  const fit = $derived(sw && sh ? Math.max(0.2, Math.min((sw - 48) / size.w, (sh - 48) / size.h)) : 0);
  const s = $derived(fit && zoom ? zoom : fit);
  // Ctrl + wheel steps through the zoom list; zooming out stops at "fit". A trackpad's stream of small events is slowed to one step per 120 ms
  const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
  let wheelAt = 0;
  const wheelZoom = (f: number) => {
    if (performance.now() - wheelAt < 120) return;
    wheelAt = performance.now();
    const out = ZOOMS.findLast((z) => z < s - 0.001);
    zoom = f > 1 ? ZOOMS.find((z) => z > s + 0.001) ?? ZOOMS[ZOOMS.length - 1] : out === undefined || out < fit ? 0 : out;
  };

  // background: the page with what the edits take away already gone (the rest is drawn on top while editing)
  let canvas = $state<HTMLCanvasElement>(), clean = $state(''); // clean: the untouched page, for pictures of photos being moved
  const lifted = $derived(JSON.stringify(objs.flatMap((o): Edit[] => o.kind === 'image' ? [{ kind: 'image', index: o.index, from: o.from, ...o.from }]
    : o.kind === 'text' && o.from ? [{ kind: 'text', from: o.from, text: '', size: 1, color: [0, 0, 0], bold: false, align: 'left', ...o.from }]
    : o.kind === 'redact' && o.w > 2 && o.h > 2 && !hidden[o.id] ? [{ kind: 'redact', white: o.white, x: o.x, y: o.y, w: o.w, h: o.h }]
    : o.kind === 'move' && o.from.w > 2 && o.from.h > 2 ? [{ kind: 'move', from: o.from, ...o.from }] : [])));
  $effect(() => {
    if (doc < 0 || !s || !canvas) return;
    const edits = JSON.parse(lifted) as Edit[], scale = s * Math.min(devicePixelRatio || 1, 2), c = canvas;
    const job = edits.length ? pool.run<ImageBitmap>({ op: 'edit', page: 0, priority: 0, key: 'editor', args: { doc, page: 0, edits, scale } })
      : pool.run<ImageBitmap>({ op: 'render', page: 0, priority: 0, key: 'editor', args: { doc, scale } });
    job.then(async (bmp) => {
      c.width = bmp.width; c.height = bmp.height; c.getContext('2d')!.drawImage(bmp, 0, 0);
      if (!edits.length && !clean) { const o = new OffscreenCanvas(bmp.width, bmp.height); o.getContext('2d')!.drawImage(bmp, 0, 0); clean = URL.createObjectURL(await o.convertToBlob()); }
      bmp.close();
    }).catch(() => {});
  });

  // the browser's first baseline in a text box of LEADING line height vs the engine's (BASELINE): the box is shifted by
  // the difference so the text on screen sits where it will be written
  let shift = $state([0, 0]);
  async function measure() {
    try {
      shift = await Promise.all([400, 700].map(async (wt) => {
        await document.fonts.load(`${wt} 100px Tajawal`);
        const c = document.createElement('canvas').getContext('2d')!; c.font = `${wt} 100px Tajawal`;
        const m = c.measureText('Hgا'), a = m.fontBoundingBoxAscent / 100, d = m.fontBoundingBoxDescent / 100;
        return BASELINE - ((LEADING - a - d) / 2 + a);
      }));
    } catch {}
  }

  // undo / redo: snapshots of the edits
  let past: Obj[][] = [], future: Obj[][] = [], canUndo = $state(false), canRedo = $state(false);
  const snap = () => $state.snapshot(objs) as Obj[];
  function record(before: Obj[]) { past.push(before); future = []; canUndo = true; canRedo = false; }
  function change(f: () => void) { const before = snap(); f(); record(before); }
  function undo() { if (!past.length) return; future.push(snap()); objs = past.pop()!; canUndo = !!past.length; canRedo = true; keep(); }
  function redo() { if (!future.length) return; past.push(snap()); objs = future.pop()!; canRedo = !!future.length; canUndo = true; keep(); }
  const keep = () => { chosen = chosen.filter((k) => k.startsWith('line:') ? !liftedLine(+k.slice(5)) : k.startsWith('pic:') ? !liftedImage(+k.slice(4)) : objs.some((o) => o.id === k && !o.removed)); };

  const stateOf = (o: Obj) => { const { id, orig, ...rest } = $state.snapshot(o) as Obj; return JSON.stringify(rest); };
  function select(id: string | null) { if (chosen.length !== 1 || chosen[0] !== id) choose(id ? [id] : []); }
  // choosing something else lets go of the last ones: a lifted line or photo left as it was goes back to the page untouched
  function choose(keys: string[]) {
    const gone = objs.filter((o) => isOn(o.id) && !keys.includes(o.id) && ((o.orig && o.orig === stateOf(o)) || (o.kind === 'text' && !o.from && !o.text.trim())));
    if (gone.length) objs = objs.filter((o) => !gone.includes(o));
    chosen = keys;
    if (keys.length > 1 && document.activeElement instanceof HTMLTextAreaElement) document.activeElement.blur(); // Delete and the arrows now act on the selection
  }
  const toggle = (k: string) => choose(isOn(k) ? chosen.filter((x) => x !== k) : [...chosen, k]);
  // what a box on the page touches: the page's lines and pictures, and the editor's objects (not deleted or hidden)
  function touching(b: Box) {
    const hit = (a: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    return [...found.lines.flatMap((l, i) => (!liftedLine(i) && hit(l) ? ['line:' + i] : [])), ...found.images.flatMap((p, i) => (!liftedImage(i) && hit(p) ? ['pic:' + i] : [])),
      ...objs.filter((o) => !o.removed && !hidden[o.id] && hit(o)).map((o) => o.id)];
  }
  // the chosen page lines (unless `lines` is false) and pictures become editor objects; the selection keeps them by their new ids
  function lift(lines = true): Obj[] {
    chosen = chosen.map((k) => (k.startsWith('line:') && lines ? lineObj(+k.slice(5)).id : k.startsWith('pic:') ? addImage(+k.slice(4)).id : k));
    return objs.filter((o) => isOn(o.id));
  }

  const rgb = (c: number[]) => `rgb(${c.map((v) => Math.round(v * 255)).join(' ')})`;
  // text colours: black and the Waraq palette (as 0..1 RGB for the engine)
  const hex = (h: string) => [1, 3, 5].map((i) => +(parseInt(h.slice(i, i + 2), 16) / 255).toFixed(3));
  const COLOURS: [Key, number[]][] = [['black', hex('#000000')], ['inkColour', hex('#233c36')], ['greenColour', hex('#15775d')], ['mintColour', hex('#eaf3eb')], ['whiteColour', hex('#fafbf8')]];
  const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 60, 72];
  const sameColour = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 0.01);

  async function focusText(id: string) { await tick(); document.querySelector<HTMLTextAreaElement>(`[data-obj="${id}"] textarea`)?.focus(); }
  // a click on the page: places a new text box (Add text), or lets go of the selection
  function pageDown(e: PointerEvent) {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).matches('canvas')) return;
    if (tool === 'redact' || tool === 'move') { markArea(e); return; }
    if (tool !== 'text') { band(e); return; }
    // the box grows from the click towards the end of the line: rightwards in English, leftwards in Arabic
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect(), x = (e.clientX - r.left) / s, y = (e.clientY - r.top) / s, rtl = i18n.lang === 'ar';
    const w = Math.max(80, Math.min(260, rtl ? x - 8 : size.w - x - 8));
    const o: Obj = { id: uid(), kind: 'text', text: '', size: 16, color: COLOURS[1][1], bold: false, align: rtl ? 'right' : 'left', x: rtl ? Math.max(0, x - w) : x, y: y - 8, w, h: 16 * LEADING };
    e.preventDefault();
    change(() => objs.push(o)); select(o.id); tool = 'select'; focusText(o.id);
  }
  // Select: a drag on an empty spot draws a box that selects everything it touches (Ctrl / Shift / Select several add to the selection);
  // a click there lets go. A finger draws one only in Select several (otherwise a tap lets go)
  let area = $state<Box | null>(null);
  function band(e: PointerEvent) {
    const keys = e.ctrlKey || e.metaKey || e.shiftKey;
    if (!keys && !several) choose([]);
    if (e.pointerType === 'touch' && !several) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement, r = el.getBoundingClientRect(), x0 = (e.clientX - r.left) / s, y0 = (e.clientY - r.top) / s, start = [...chosen];
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const x = (ev.clientX - r.left) / s, y = (ev.clientY - r.top) / s;
      if (!area && Math.abs(x - x0) + Math.abs(y - y0) < 4 / s) return;
      area = { x: Math.min(x0, x), y: Math.min(y0, y), w: Math.abs(x - x0), h: Math.abs(y - y0) };
      chosen = [...new Set([...start, ...touching(area)])];
    };
    const up = () => {
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      if (!area && several && !keys) choose([]); // Select several: a tap on an empty spot lets go
      area = null;
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  let coverWhite = $state(false); // the fill the next box gets: the last one chosen
  // Redact / Move area: drag a box over what should go (or move); it stays selected (move it, resize it, Delete takes it away)
  function markArea(e: PointerEvent) {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement, r = el.getBoundingClientRect(), x0 = (e.clientX - r.left) / s, y0 = (e.clientY - r.top) / s, before = snap();
    const o: Obj = tool === 'move' ? { id: uid(), kind: 'move', no: ++made.move, from: { x: x0, y: y0, w: 0, h: 0 }, x: x0, y: y0, w: 0, h: 0 } : { id: uid(), kind: 'redact', no: ++made.redact, white: coverWhite, x: x0, y: y0, w: 0, h: 0 };
    objs.push(o); select(o.id);
    const box = objs[objs.length - 1];
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const x = (ev.clientX - r.left) / s, y = (ev.clientY - r.top) / s;
      const b = { x: Math.min(x0, x), y: Math.min(y0, y), w: Math.abs(x - x0), h: Math.abs(y - y0) };
      Object.assign(box, b);
      if (box.kind === 'move') box.from = b;
    };
    const up = () => {
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      if (box.w < 4 || box.h < 4) { objs = objs.filter((x) => x.id !== o.id); chosen = []; return; }
      record(before);
      if (box.kind === 'redact' && box.white) coverText(box);
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  // cover + type: a text box over a fresh white box (not recorded: undo takes the typing, then the box; left empty it goes away)
  function coverText(box: Box) {
    const sz = Math.min(48, Math.max(8, Math.round(box.h * 0.7))), t: Obj = { id: uid(), kind: 'text', text: '', size: sz, color: COLOURS[1][1], bold: false, align: i18n.lang === 'ar' ? 'right' : 'left', x: box.x, y: box.y, w: box.w, h: box.h };
    objs.push(t); select(t.id); focusText(t.id);
  }
  // an existing line of text: a text box in its place, with its text, size, colour and weight; the box reaches the page
  // margin so a longer text stays on one line instead of wrapping onto the line below
  function lineObj(i: number) {
    const l = found.lines[i], w = Math.max(l.w, l.rtl ? l.x + l.w - 24 : size.w - l.x - 24);
    const o: Obj = { id: uid(), kind: 'text', line: i, from: { x: l.x, y: l.y, w: l.w, h: l.h }, text: l.text, size: +l.size.toFixed(1), color: l.color, bold: l.bold, align: l.rtl ? 'right' : 'left',
      x: l.rtl ? l.x + l.w - w : l.x, y: l.base - BASELINE * l.size, w, h: l.h };
    o.orig = stateOf(o); objs.push(o);
    return objs[objs.length - 1];
  }
  function liftLine(i: number) { const { id } = lineObj(i); select(id); focusText(id); }
  // the picture of a lifted photo alone (page-sized, transparent), for the box that follows the pointer
  let pics = $state<Record<number, string>>({});
  async function pictureOf(i: number) {
    if (pics[i]) return;
    try {
      const bmp = await pool.run<ImageBitmap>({ op: 'picture', page: 0, priority: 0, args: { doc, page: 0, index: i, scale: Math.min(3, Math.max(1.5, s * Math.min(devicePixelRatio || 1, 2))) } });
      const o = new OffscreenCanvas(bmp.width, bmp.height); o.getContext('2d')!.drawImage(bmp, 0, 0); bmp.close();
      pics[i] = URL.createObjectURL(await o.convertToBlob());
    } catch {}
  }
  function addImage(i: number) {
    const b = found.images[i], o: Obj = { id: uid(), kind: 'image', index: i, from: { ...b }, ...b };
    o.orig = stateOf(o); objs.push(o); pictureOf(i);
    return objs[objs.length - 1];
  }
  function liftImage(i: number) { const o = addImage(i); select(o.id); return o; }
  const liftedLine = (i: number) => objs.some((o) => o.kind === 'text' && o.line === i);
  const liftedImage = (i: number) => objs.some((o) => o.kind === 'image' && o.index === i);

  // drag to move (the whole photo, or the bar above a text box); the corner resizes (photos keep their shape)
  function drag(e: PointerEvent, o: Obj, mode: 'move' | 'size', el = e.currentTarget as HTMLElement) {
    if (e.button !== 0) return;
    if (mode === 'move' && (additive(e) || (chosen.length > 1 && isOn(o.id)))) { pressMany(e, o.id); return; }
    e.preventDefault(); e.stopPropagation(); select(o.id);
    const before = snap(), sx = e.clientX, sy = e.clientY, start = { x: o.x, y: o.y, w: o.w, h: o.h };
    let moved = false;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / s, dy = (ev.clientY - sy) / s;
      moved ||= Math.abs(dx) + Math.abs(dy) > 0.5;
      if (mode === 'move') { o.x = Math.min(size.w - 16, Math.max(16 - start.w, start.x + dx)); o.y = Math.min(size.h - 16, Math.max(-start.h + 16, start.y + dy)); }
      else if (o.kind === 'text') o.w = Math.max(24, start.w + dx);
      else if (o.kind === 'redact') { o.w = Math.max(4, start.w + dx); o.h = Math.max(4, start.h + dy); }
      else { o.w = Math.max(12, start.w + dx); o.h = (o.w * start.h) / start.w; }
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); if (moved) record(before); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  // a press on something with several chosen, or with Ctrl / Shift / Select several: adds or removes it, or drags all chosen
  // together (one undo step; lines and pictures of the page are lifted when the drag starts); a click without a drag chooses that one alone
  let held = false; // the press was taken here: the text box under it does not take the focus
  function pressMany(e: PointerEvent, k: string) {
    e.preventDefault(); e.stopPropagation(); held = true;
    if (additive(e)) { toggle(k); return; }
    const el = sheet!, before = snap(), sx = e.clientX, sy = e.clientY;
    let group: { o: Obj; x: number; y: number }[] | null = null;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      let dx = (ev.clientX - sx) / s, dy = (ev.clientY - sy) / s;
      if (!group) { if (Math.abs(dx) + Math.abs(dy) < 3 / s) return; group = lift().map((o) => ({ o, x: o.x, y: o.y })); }
      // each keeps at least 16 points on the page, like a single drag
      dx = Math.min(...group.map((g) => size.w - 16 - g.x), Math.max(...group.map((g) => 16 - g.o.w - g.x), dx));
      dy = Math.min(...group.map((g) => size.h - 16 - g.y), Math.max(...group.map((g) => 16 - g.o.h - g.y), dy));
      for (const g of group) { g.o.x = g.x + dx; g.o.y = g.y + dy; }
    };
    const up = () => {
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      if (group) record(before);
      else if (k.startsWith('line:')) liftLine(+k.slice(5));
      else if (k.startsWith('pic:')) liftImage(+k.slice(4));
      else { select(k); focusText(k); }
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  function nudge(dx: number, dy: number) { const before = snap(); for (const o of lift()) { o.x += dx; o.y += dy; } record(before); }

  // typing is one undo step per visit to the text box
  let typing: Obj[] | null = null;
  // a new text box follows the direction of what is typed (Arabic to the right) until an alignment is chosen; the box
  // turns around the point where it was placed
  function direction(o: Obj) {
    if (o.kind !== 'text' || o.from || o.aligned || o.align === 'center') return;
    const first = o.text.match(/[A-Za-z؀-ۿ]/)?.[0];
    if (!first) return;
    const want = /[؀-ۿ]/.test(first) ? 'right' : 'left';
    if (want !== o.align) { o.x = Math.max(0, Math.min(size.w - o.w, o.x + (want === 'right' ? -o.w : o.w))); o.align = want; }
  }
  function typed(o: Obj) { if (typing && JSON.stringify(typing.find((x) => x.id === o.id)) !== JSON.stringify($state.snapshot(o))) record(typing); typing = null; }

  // everything chosen goes in one undo step; a line of the page is taken out of the PDF for good (editpage.ts redacts its text)
  function remove() {
    if (!chosen.length) return;
    change(() => {
      for (const o of lift()) {
        if (o.kind === 'image') o.removed = true; // stays an edit: the photo is taken off the page
        else if (o.kind === 'text' && o.from) { o.removed = true; o.text = ''; }
        else objs = objs.filter((x) => x.id !== o.id);
      }
    });
    chosen = [];
  }

  // layers: the objects that are drawn on the page, in the order of `objs` (the last one is in front; saved as `z`). Front first in the list,
  // then the page's own pictures that were not touched yet (clicking one lifts it, like clicking it on the page)
  const listable = (o: Obj) => !o.removed && (o.kind === 'image' || o.kind === 'move' || o.kind === 'photo' || (o.kind === 'redact' && !!o.white) || (o.kind === 'text' && !o.from));
  const THUMB = 32; // --thumb
  const thumb = (url: string, b: Box) => { const k = THUMB / Math.max(b.w, b.h, 1); return `background-image:url(${url});background-size:${size.w * k}px ${size.h * k}px;background-position:${(THUMB - b.w * k) / 2 - b.x * k}px ${(THUMB - b.h * k) / 2 - b.y * k}px`; };
  type Row = { key: string; name: string; o?: Obj; image?: number; style?: string; img?: string; icon?: string; white?: boolean };
  const rows = $derived<Row[]>([
    ...objs.filter(listable).reverse().map((o): Row => {
      const n = (k: Key, v: string | number) => t(k).replace('{n}', String(v));
      if (o.kind === 'image') return { key: o.id, o, name: n('layerPicture', o.index + 1), ...(o.photo != null ? { img: urls[o.photo] } : pics[o.index] ? { style: thumb(pics[o.index], o.from) } : { icon: 'images' }) };
      if (o.kind === 'move') return { key: o.id, o, name: n('layerArea', o.no ?? 1), ...(clean ? { style: thumb(clean, o.from) } : { icon: 'select' }) };
      if (o.kind === 'photo') return { key: o.id, o, name: n('layerPhoto', o.no ?? 1), img: urls[o.photo] };
      if (o.kind === 'redact') return { key: o.id, o, name: n('layerCover', o.no ?? 1), white: true };
      const first = o.kind === 'text' ? o.text.trim().split(/\s+/).slice(0, 4).join(' ') : '';
      return { key: o.id, o, name: first ? t('layerText').replace('{text}', first) : t('layerTextBox'), icon: 'text' };
    }),
    ...found.images.map((_, i) => i).filter((i) => !liftedImage(i)).map((i): Row => ({ key: 'pic:' + i, image: i, name: t('layerPicture').replace('{n}', String(i + 1)), ...(pics[i] ? { style: thumb(pics[i], found.images[i]) } : { icon: 'images' }) })),
  ]);
  $effect(() => { if (doc >= 0 && s) found.images.slice(0, 24).forEach((_, i) => pictureOf(i)); }); // the pictures of the list
  // the order buttons act on every chosen layer; a chosen picture of the page not lifted yet is lifted first (it then counts as in front)
  const listed = $derived(objs.filter(listable)), pending = $derived(chosen.some((k) => k.startsWith('pic:')));
  const canUp = $derived(pending || listed.some((o, i) => isOn(o.id) && listed.slice(i + 1).some((x) => !isOn(x.id))));
  const canDown = $derived(pending || listed.some((o, i) => isOn(o.id) && listed.slice(0, i).some((x) => !isOn(x.id))));
  const ORDER = [['front', 'to-front', 'toFront'], ['forward', 'forward', 'layerForward'], ['backward', 'backward', 'layerBackward'], ['back', 'to-back', 'toBack']] as const;
  function stack(to: To) {
    const before = snap(), on = (o: Obj) => isOn(o.id) && listable(o);
    lift(false);
    const next = restack(objs, listable, on, to);
    if (next.every((o, i) => o === objs[i])) return;
    next.filter(on).forEach((o) => (o.orig = undefined)); // no longer "left as it was": the new order is kept
    objs = next; record(before);
  }
  function pick(r: Row, e: MouseEvent) { tool = 'select'; if (additive(e)) toggle(r.key); else if (r.o) select(r.o.id); else liftImage(r.image!); }

  // photos: a new one in the middle of the page, or a replacement in the selected photo's place
  let picker: HTMLInputElement, replacing = false;
  async function choosePhoto(replace: boolean) {
    replacing = replace;
    const [f] = await pickFiles({ accept: { 'image/*': ['.png', '.jpg', '.jpeg'] }, fallback: () => picker.click() });
    if (f) await usePhoto(f.file);
  }
  async function usePhoto(file: File) {
    let bmp: ImageBitmap;
    try { bmp = await createImageBitmap(file); } catch { alert(t('notImage')); return; }
    const n = photos.push(new Uint8Array(await file.arrayBuffer())) - 1;
    urls = [...urls, URL.createObjectURL(file)];
    const target = replacing ? sel : undefined;
    if (target && (target.kind === 'image' || target.kind === 'photo')) change(() => { target.photo = n; });
    else {
      const w = Math.min(size.w * 0.4, bmp.width * 0.75), h = (w * bmp.height) / bmp.width;
      const o: Obj = { id: uid(), kind: 'photo', no: ++made.photo, photo: n, x: (size.w - w) / 2, y: Math.max(8, (size.h - h) / 2), w, h };
      change(() => objs.push(o)); select(o.id);
    }
    bmp.close();
  }
  // what a box being moved shows: the old photo alone, or the part of the untouched page an area covers
  function picture(o: Obj) {
    const url = o.kind === 'move' ? clean : o.kind === 'image' && o.photo == null ? pics[o.index] : '';
    if (!url || (o.kind !== 'move' && o.kind !== 'image')) return '';
    const kx = o.w / o.from.w, ky = o.h / o.from.h;
    return `background-image:url(${url});background-size:${size.w * s * kx}px ${size.h * s * ky}px;background-position:${-o.from.x * s * kx}px ${-o.from.y * s * ky}px`;
  }

  async function save() {
    select(null);
    const edits = (snap()).map(({ id, orig, line, no, ...e }, z) => ({ ...e, z }) as Edit); // z: the order on the page, as the layers panel and the stage show it
    if (!edits.length) { onCancel(); return; }
    busy = t('savingPage');
    try {
      const bytes = await pool.run<Uint8Array>({ op: 'edit', priority: 0, any: true, args: { doc, page: 0, edits, photos: photos.map((p) => p.slice()) } });
      const a = await pool.add(bytes.slice());
      await onSave({ doc: a.id, w: a.sizes[0].w, h: a.sizes[0].h, bytes });
    } catch (e) { busy = ''; alert(String((e as Error).message || e)); }
  }

  function keys(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest('textarea,input,select')) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'a' && doc >= 0) { e.preventDefault(); tool = 'select'; choose(touching({ x: -1e5, y: -1e5, w: 2e5, h: 2e5 })); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && chosen.length) { e.preventDefault(); remove(); }
    else if (e.key.startsWith('Arrow') && chosen.length) { // a nudge: 1 point, Shift 10
      e.preventDefault();
      const d = e.shiftKey ? 10 : 1;
      nudge(e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0);
    }
    else if (e.key === 'Escape') { tool = 'select'; select(null); }
  }
</script>

<svelte:window onkeydown={keys} />
<input bind:this={picker} type="file" accept="image/png,image/jpeg" hidden
  onchange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) usePhoto(f); }} />
<div class="editor">
  <div class="tools" role="toolbar" aria-label={t('editPage')}>
    {#if scope !== undefined}<ScopeTabs bind:scope /><span class="sep"></span>{/if}
    <button class="btn" class:on={tool === 'select'} aria-pressed={tool === 'select'} onclick={() => (tool = 'select')}>{@html icon('move')}{t('selectTool')}</button>
    <button class="btn" class:on={tool === 'text'} aria-pressed={tool === 'text'} onclick={() => { tool = 'text'; select(null); }} disabled={doc < 0}>{@html icon('text')}{t('addText')}</button>
    <button class="btn" onclick={() => choosePhoto(false)} disabled={doc < 0} title={t('addPhoto')}>{@html icon('images')}<span class="lbl">{t('addPhoto')}</span></button>
    <button class="btn" class:on={tool === 'redact'} aria-pressed={tool === 'redact'} onclick={() => { tool = 'redact'; select(null); }} disabled={doc < 0} title={t('redactArea')}>{@html icon('redact')}<span class="lbl">{t('redactArea')}</span></button>
    <button class="btn" class:on={tool === 'move'} aria-pressed={tool === 'move'} onclick={() => { tool = 'move'; select(null); }} disabled={doc < 0} title={t('moveArea')}>{@html icon('select')}<span class="lbl">{t('moveArea')}</span></button>
    <span class="sep"></span>
    <button class="btn icon" onclick={undo} disabled={!canUndo} title={t('undo')} aria-label={t('undo')}>{@html icon('undo')}</button>
    <button class="btn icon" onclick={redo} disabled={!canRedo} title={t('redo')} aria-label={t('redo')}><span class="flip">{@html icon('undo')}</span></button>
    <button class="btn icon" onclick={remove} disabled={!chosen.length} title={t('delete')} aria-label={t('delete')}>{@html icon('delete')}</button>
    {#if !view.narrow}
    <label class="zoomer"><span class="sr">{t('zoom')}</span><select bind:value={zoom} aria-label={t('zoom')}>
      <option value={0}>{t('zoomFit')}</option>{#each ZOOMS as z}<option value={z}>{Math.round(z * 100)}%</option>{/each}
    </select></label>
    <span class="where num">{label}</span>
    <button class="btn" onclick={onCancel} disabled={!!busy && doc >= 0}>{@html icon('close')}{t('cancel')}</button>
    <button class="btn primary" onclick={save} disabled={!!busy}>{@html icon('check')}{t('savePage')}</button>
    {/if}
  </div>

  <div class="body">
    <div class="stage" bind:clientWidth={sw} bind:clientHeight={sh} use:ctrlWheel={wheelZoom} use:autoScroll>
      {#if busy}<p class="busy" role="status">{busy}</p>{/if}
      {#if s}
        <!-- svelte-ignore a11y_no_static_element_interactions (the page itself: a click places text or lets go of the selection) -->
        <div class="sheet" class:placing={tool !== 'select'} bind:this={sheet} dir="ltr" style="width:{size.w * s}px;height:{size.h * s}px" onpointerdown={pageDown}>
          <canvas bind:this={canvas} style="width:{size.w * s}px;height:{size.h * s}px"></canvas>
          {#if tool === 'select' && doc >= 0}
            {#each byArea as i}{@const b = found.images[i]}{#if !liftedImage(i)}
              <button class="hit photo" class:on={isOn('pic:' + i)} style="left:{b.x * s}px;top:{b.y * s}px;width:{b.w * s}px;height:{b.h * s}px" aria-label="{t('changePhoto')} {i + 1}" aria-pressed={isOn('pic:' + i)}
                onpointerdown={(e) => { if (e.button !== 0) return; if (additive(e) || (chosen.length > 1 && isOn('pic:' + i))) pressMany(e, 'pic:' + i); else drag(e, liftImage(i), 'move', sheet); }}></button>
            {/if}{/each}
            {#each found.lines as l, i}{#if !liftedLine(i)}
              <button class="hit line" class:on={isOn('line:' + i)} style="left:{l.x * s}px;top:{l.y * s}px;width:{l.w * s}px;height:{l.h * s}px" aria-label="{t('changeText')}: {l.text}" aria-pressed={isOn('line:' + i)}
                onpointerdown={(e) => { if (additive(e) || (chosen.length > 1 && isOn('line:' + i))) { pressMany(e, 'line:' + i); return; } e.stopPropagation(); e.preventDefault(); liftLine(i); }}></button>
            {/if}{/each}
          {/if}
          {#if area}<div class="band" style="left:{area.x * s}px;top:{area.y * s}px;width:{area.w * s}px;height:{area.h * s}px"></div>{/if}
          {#each objs as o (o.id)}
            {#if !o.removed}
              {#if o.kind === 'text'}
                <!-- svelte-ignore a11y_no_static_element_interactions (Ctrl+click and dragging several; the text box inside takes the keyboard) -->
                <div class="obj text" class:on={isOn(o.id)} class:hid={hidden[o.id]} data-obj={o.id} style="left:{o.x * s}px;top:{o.y * s}px;width:{o.w * s}px"
                  onpointerdowncapture={(e) => { held = false; if (e.button === 0 && (additive(e) || (chosen.length > 1 && isOn(o.id)))) pressMany(e, o.id); }}>
                  {#if o.id === selected}<div class="grip" title={t('moveHandle')} onpointerdown={(e) => drag(e, o, 'move')}></div>{/if}
                  <textarea bind:value={o.text} dir="auto" rows="1" spellcheck="false" placeholder={t('typeHere')} aria-label={t('textOptions')}
                    style="font-family:{family(o)};font-size:{o.size * s}px;font-weight:{o.bold ? 700 : 400};color:{rgb(o.color)};text-align:{o.align};line-height:{LEADING};transform:translateY({shift[o.bold ? 1 : 0] * o.size * s}px)"
                    onmousedown={(e) => { if (held) { held = false; e.preventDefault(); } }}
                    oninput={() => direction(o)} onfocus={() => { if (!isOn(o.id) || chosen.length === 1) select(o.id); typing = snap(); }} onblur={() => typed(o)}></textarea>
                  {#if o.id === selected}<div class="corner" title={t('resizeHandle')} onpointerdown={(e) => drag(e, o, 'size')}></div>{/if}
                </div>
              {:else}
                <!-- svelte-ignore a11y_no_static_element_interactions (moved with the pointer; Delete and the options panel work from the keyboard) -->
                <div class="obj pic" class:redact={o.kind === 'redact'} class:area={o.kind === 'move'} class:white={o.kind === 'redact' && o.white} class:hid={hidden[o.id]} class:on={isOn(o.id)} data-obj={o.id} style="left:{o.x * s}px;top:{o.y * s}px;width:{o.w * s}px;height:{o.h * s}px;{picture(o)}"
                  onpointerdown={(e) => drag(e, o, 'move')}>
                  {#if (o.kind === 'image' || o.kind === 'photo') && o.photo != null}<img src={urls[o.photo]} alt="" draggable="false" />{/if}
                  {#if o.id === selected && o.kind !== 'move'}<div class="corner" title={t('resizeHandle')} onpointerdown={(e) => drag(e, o, 'size')}></div>{/if}
                </div>
              {/if}
            {/if}
          {/each}
        </div>
      {/if}
    </div>

    {#if view.narrow}
      <Sheet label={t('options')} bind:open={sheetOpen}>
        {#snippet bar()}
          <button class="btn" class:on={several} aria-pressed={several} onclick={() => (several = !several)}>{t('selectSeveral')}</button>
          <button class="btn icon" onclick={onCancel} disabled={!!busy && doc >= 0} title={t('cancel')} aria-label={t('cancel')}>{@html icon('close')}</button>
          <!-- Cancel as an icon and Save page without one: Select several, Cancel and Save page fit a phone's dock -->
          <button class="btn primary" onclick={save} disabled={!!busy}>{t('savePage')}</button>
        {/snippet}
        {@render panel()}
      </Sheet>
    {:else}
      <aside class="side" aria-label={t('options')}>{@render panel()}</aside>
    {/if}
  </div>
</div>

{#snippet panel()}
      <div class="opts">
      {#if sel?.kind === 'text'}
        {@const o = sel}
        <h2>{t('textOptions')}</h2>
        <label class="field"><span>{t('fontSize')}</span>
          <select value={o.size} onchange={(e) => change(() => (o.size = +e.currentTarget.value))}>
            {#each SIZES.includes(o.size) ? SIZES : [...SIZES, o.size].sort((a, b) => a - b) as n}<option value={n}>{n}</option>{/each}
          </select>
        </label>
        <div class="field" role="radiogroup" aria-label={t('colour')}><span>{t('colour')}</span>
          <span class="row">
            {#each COLOURS as [name, c]}
              <button class="swatch" role="radio" aria-checked={sameColour(o.color, c)} title={t(name)} aria-label={t(name)} style="--c:{rgb(c)}" onclick={() => change(() => (o.color = c))}></button>
            {/each}
          </span>
        </div>
        <span class="row"><button class="btn" class:on={o.bold} aria-pressed={o.bold} onclick={() => change(() => (o.bold = !o.bold))}><b>{t('bold')}</b></button></span>
        <div class="field"><span>{t('alignment')}</span>
          <span class="row" role="group" aria-label={t('alignment')} dir="ltr">
            {#each [['left', 'alignLeft'], ['center', 'alignCenter'], ['right', 'alignRight']] as [a, k]}
              <button class="btn" class:on={o.align === a} aria-pressed={o.align === a} onclick={() => change(() => { o.align = a as typeof o.align; o.aligned = true; })}>{t(k as Key)}</button>
            {/each}
          </span>
        </div>
        <p class="help">{t('textHelp')}</p>
        {#if o.from && fontInfo}
          <p class="note" class:warn={!!fontInfo.using} data-testid="font-note">{@html icon('info')}<span>{fontText(fontInfo)}</span></p>
          {#if fontInfo.width && fontInfo.width > o.w * 1.18}
            <p class="note warn" data-testid="shrink-note">{@html icon('info')}<span>{t('fontShrink').replace('{pct}', String(Math.round((o.w / fontInfo.width) * 100)))}</span></p>
          {/if}
        {:else}
          <p class="note">{@html icon('info')}<span>{t('fontNote')}</span></p>
        {/if}
        <button class="btn" onclick={remove}>{@html icon('delete')}{t('delete')}</button>
      {:else if sel?.kind === 'redact'}
        {@const o = sel}
        <h2>{t('redactArea')}</h2>
        <div class="field"><span>{t('coverFill')}</span>
          <span class="row" role="group" aria-label={t('coverFill')}>
            {#each [[false, 'coverBlack'], [true, 'coverWhite']] as [white, k]}
              <button class="btn" class:on={!!o.white === white} aria-pressed={!!o.white === white} onclick={() => change(() => { o.white = white as boolean; coverWhite = white as boolean; })}>{t(k as Key)}</button>
            {/each}
          </span>
        </div>
        <p class="help">{t(o.white ? 'coverWhiteHelp' : 'placeRedact')}</p>
        <button class="btn" onclick={remove}>{@html icon('delete')}{t('delete')}</button>
      {:else if sel?.kind === 'move'}
        <h2>{t('moveArea')}</h2>
        <p class="help">{t('moveAreaHelp')}</p>
        <button class="btn" onclick={remove}>{@html icon('delete')}{t('delete')}</button>
      {:else if sel}
        <h2>{t('photoOptions')}</h2>
        <p class="help">{t('photoHelp')}</p>
        <button class="btn" onclick={() => choosePhoto(true)}>{@html icon('images')}{t('replacePhoto')}</button>
        <button class="btn" onclick={remove}>{@html icon('delete')}{t('delete')}</button>
      {:else if chosen.length}
        <h2 class="num" data-testid="many">{t('nSelected').replace('{n}', String(chosen.length))}</h2>
        <p class="help">{t('manyHelp')}</p>
        <button class="btn" onclick={remove}>{@html icon('delete')}{t('delete')}</button>
      {:else}
        <h2>{t('editPage')}</h2>
        <p class="help">{tool === 'text' ? t('placeText') : tool === 'redact' ? t('placeRedact') : tool === 'move' ? t('placeMove') : t('editorHelp')}</p>
        <p class="note">{@html icon('info')}<span>{t('fontNote')}</span></p>
      {/if}
      </div>

      <section class="layers" id="layers" aria-label={t('layers')}>
        <div class="lhead">
          <h2>{t('layers')}</h2>
        </div>
        <div class="order" role="group" aria-label={t('layerOrder')}>
          {#each ORDER as [to, ic, label]}
            <button class="btn icon" onclick={() => stack(to)} disabled={to === 'front' || to === 'forward' ? !canUp : !canDown} title={t(label)} aria-label={t(label)}>{@html icon(ic)}</button>
          {/each}
        </div>
        {#if rows.length}
          <ul class="list" aria-label={t('layerList')}>
            {#each rows as r (r.key)}
              {@const off = !!r.o && !!hidden[r.o.id]}
              <li class:on={isOn(r.key)} class:off>
                <button class="pick" aria-pressed={isOn(r.key)} title={r.name} onclick={(e) => pick(r, e)}>
                  <span class="thumb" class:white={r.white} style={r.style}>{#if r.img}<img src={r.img} alt="" draggable="false" />{:else if r.icon}{@html icon(r.icon)}{/if}</span>
                  <bdi class="name">{r.name}</bdi>
                </button>
                {#if r.o}
                  {@const id = r.o.id}
                  <button class="btn icon eye" onclick={() => (hidden[id] = !hidden[id])} title={t(off ? 'layerShow' : 'layerHide')} aria-label={t(off ? 'layerShow' : 'layerHide')}>{@html icon(off ? 'eye-off' : 'eye')}</button>
                {/if}
              </li>
            {/each}
          </ul>
        {:else}
          <p class="help">{t('layersEmpty')}</p>
        {/if}
      </section>
{/snippet}

<style>
  .editor { height: 100%; display: grid; grid-template-rows: auto 1fr; min-height: 0; }
  /* below 1500 px the secondary tools show their icon only (tooltip + aria name kept), so Save page stays on the one row */
  @media (max-width: 1500px) and (min-width: 821px) { .tools .lbl { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; } }
  .tools { display: flex; align-items: center; gap: var(--s-8); padding: var(--s-8) var(--s-16); background: var(--surface); border-bottom: 1px solid var(--line); flex-wrap: wrap; }
  .sep { width: 1px; height: 24px; background: var(--line); }
  .flip { display: grid; transform: scaleX(-1); }
  .where { margin-inline-start: auto; color: var(--muted); }
  .btn.on { background: var(--green-soft); border-color: var(--green); color: var(--green-deep); }
  .body { display: grid; grid-template-columns: 1fr var(--panel); min-height: 0; }
  .stage { position: relative; overflow: auto; display: flex; padding: var(--s-24); background: var(--canvas); min-height: 0; }
  .busy { position: absolute; inset: 0; z-index: 3; margin: 0; display: grid; place-items: center; background: var(--veil); font-size: var(--fs-16); font-weight: 600; }
  .sheet { position: relative; flex: none; margin: auto; background: var(--surface); box-shadow: var(--shadow); touch-action: none; }
  .zoomer select { min-height: var(--control); padding: 0 var(--s-8); border: 1px solid var(--line); border-radius: var(--r-8); background: var(--paper); font: inherit; }
  .sheet.placing { cursor: text; }
  .sheet canvas { position: absolute; inset: 0; }
  .hit { position: absolute; padding: 0; border: 1px solid transparent; border-radius: 2px; background: transparent; cursor: pointer; }
  .hit:hover, .hit:focus-visible { border-color: var(--green); background: var(--select-tint); }
  .hit.line { cursor: text; }
  .hit.on { border-color: var(--green); background: var(--select-tint); outline: 2px dashed var(--green); outline-offset: 2px; }
  .band { position: absolute; z-index: 2; border: 1px solid var(--green); background: var(--select-tint); pointer-events: none; }
  .obj { position: absolute; }
  .obj.redact { border: 2px dashed var(--danger); }
  .obj.area { border: 1px solid var(--green); }
  .obj.on { outline: 2px dashed var(--green); outline-offset: 2px; }
  .text textarea { display: block; width: 100%; min-height: 1em; padding: 0; margin: 0; border: 0; background: transparent; resize: none; overflow: hidden; white-space: pre-wrap; font-family: Tajawal, sans-serif; field-sizing: content; outline: none; }
  .text:not(.on):hover { outline: 1px solid var(--green); }
  .grip { position: absolute; left: -2px; right: -2px; bottom: 100%; height: 12px; margin-bottom: 2px; border-radius: 4px 4px 0 0; background: var(--green); cursor: move; }
  .pic { cursor: move; background-repeat: no-repeat; }
  .pic img { width: 100%; height: 100%; object-fit: contain; display: block; pointer-events: none; }
  .corner { position: absolute; right: -8px; bottom: -8px; width: 14px; height: 14px; border: 2px solid var(--surface); border-radius: 50%; background: var(--green); cursor: nwse-resize; }
  .side { display: flex; flex-direction: column; gap: var(--s-16); padding: var(--s-16); background: var(--surface); border-inline-start: 1px solid var(--line); overflow-y: auto; }
  .opts h2, .lhead h2 { margin: 0; font-size: var(--fs-18); }
  .opts { display: flex; flex-direction: column; gap: var(--s-16); flex: none; }
  .obj.hid { display: none; }
  .obj.white { background: var(--page); }
  /* layers: a list under the options (in the bottom sheet on a narrow screen) */
  .layers { display: flex; flex-direction: column; gap: var(--s-8); padding-top: var(--s-16); border-top: 1px solid var(--line); }
  .lhead { display: flex; align-items: center; justify-content: space-between; }
  .order { display: flex; gap: var(--s-8); }
  .list { display: flex; flex-direction: column; gap: var(--s-8); margin: 0; padding: 0; list-style: none; }
  .list li { display: flex; align-items: center; gap: var(--s-8); }
  .list li:hover .pick { background: var(--green-soft); }
  .list li.on .pick { background: var(--green-soft); outline: 1px solid var(--green); outline-offset: -1px; }
  .pick { transition: background-color .15s ease-out; flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--s-8); min-height: var(--control); padding: var(--s-4) var(--s-8); border: 0; border-radius: var(--r-8); background: transparent; color: var(--ink); text-align: start; }
  .list li.on .pick { color: var(--green-deep); font-weight: 600; }
  .list li.off .pick { color: var(--muted); }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .thumb { flex: none; width: var(--thumb); height: var(--thumb); display: grid; place-items: center; border: 1px solid var(--line); border-radius: var(--r-8); background-color: var(--canvas); background-repeat: no-repeat; color: var(--muted); overflow: hidden; }
  .thumb.white { background-color: var(--page); }
  .thumb img { width: 100%; height: 100%; object-fit: contain; }
  .eye { flex: none; }
  .field { display: grid; gap: var(--s-8); font-weight: 600; }
  .field select { min-height: var(--control); padding: 0 var(--s-12); border: 1px solid var(--line); border-radius: var(--r-8); background: var(--paper); font-weight: 400; }
  .row { display: flex; flex-wrap: wrap; gap: var(--s-8); }
  .swatch { width: var(--control); height: var(--control); border: 1px solid var(--line); border-radius: 50%; background: var(--c); }
  .swatch[aria-checked='true'] { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--green); }
  .help { margin: 0; color: var(--muted); }
  .note { display: flex; gap: var(--s-8); margin: 0; padding: var(--s-12); border-radius: var(--r-8); background: var(--green-soft); color: var(--ink); }
  .note :global(svg) { flex: none; color: var(--green); }
  .note.warn { background: var(--paper); border: 1px solid var(--green); }
  @media (max-width: 820px) {
    .body { grid-template-columns: 1fr; padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px)); } /* the dock of the bottom sheet */
    .tools { flex-wrap: nowrap; overflow-x: auto; padding-inline: var(--s-12); } /* one row that scrolls sideways */
    .tools > :global(*) { flex: none; }
    .stage { padding: var(--s-12); }
  }
</style>
