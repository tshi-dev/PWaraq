import { tick } from 'svelte';
// Two-finger pinch on an element. Touch events (not pointer events) so the browser's own page zoom and two-finger scroll can be cancelled.
// `change(ratio, x, y)`: ratio of the current finger distance to the distance when the second finger came down; x, y: the middle between the fingers.
export function pinch(node: HTMLElement, o: { start?: () => void; change: (ratio: number, x: number, y: number) => void; end?: () => void }) {
  let d0 = 0;
  const two = (e: TouchEvent) => { const [a, b] = [e.touches[0], e.touches[1]]; return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }; };
  const down = (e: TouchEvent) => { if (e.touches.length === 2) { d0 = two(e).d || 1; o.start?.(); } };
  const move = (e: TouchEvent) => { if (e.touches.length === 2 && d0) { e.preventDefault(); const p = two(e); o.change(p.d / d0, p.x, p.y); } };
  const up = (e: TouchEvent) => { if (e.touches.length < 2 && d0) { d0 = 0; o.end?.(); } };
  const block = (e: Event) => e.preventDefault(); // Safari's own pinch-zoom of the page
  node.addEventListener('touchstart', down, { passive: true });
  node.addEventListener('touchmove', move, { passive: false });
  node.addEventListener('touchend', up); node.addEventListener('touchcancel', up);
  for (const g of ['gesturestart', 'gesturechange', 'gestureend']) node.addEventListener(g, block);
  return { destroy() {
    node.removeEventListener('touchstart', down); node.removeEventListener('touchmove', move); node.removeEventListener('touchend', up); node.removeEventListener('touchcancel', up);
    for (const g of ['gesturestart', 'gesturechange', 'gestureend']) node.removeEventListener(g, block);
  } };
}

// Ctrl + mouse wheel (and a trackpad pinch, which browsers send as Ctrl + wheel) over an element zooms that element, not the page.
// A listener of its own: Svelte's onwheel is passive, so it could not stop the browser's page zoom. `zoom(factor, x, y)`: > 1 is in.
export function ctrlWheel(node: HTMLElement, zoom: (factor: number, x: number, y: number) => void) {
  let fn = zoom;
  const wheel = (e: WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    fn(Math.exp(-(e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY) * 0.0022), e.clientX, e.clientY);
  };
  node.addEventListener('wheel', wheel, { passive: false });
  return { update(z: typeof zoom) { fn = z; }, destroy() { node.removeEventListener('wheel', wheel); } };
}

// Ctrl + wheel and pinch over a scrolling area change one number (page width, zoom factor) within [min, max], keeping the spot under the pointer in place.
export function pageZoom(node: HTMLElement, o: { get: () => number; set: (v: number) => void; min: number; max: number }) {
  let v0 = 0;
  const to = async (v: number, x: number, y: number) => {
    const old = o.get(), nv = Math.min(o.max, Math.max(o.min, v));
    if (nv === old) return;
    const r = node.getBoundingClientRect(), r1 = nv / old;
    const px = node.scrollLeft + x - r.left, py = node.scrollTop + y - r.top;
    o.set(nv); await tick();
    node.scrollLeft = px * r1 - (x - r.left); node.scrollTop = py * r1 - (y - r.top);
  };
  const a = ctrlWheel(node, (f, x, y) => to(o.get() * f, x, y));
  const b = pinch(node, { start: () => (v0 = o.get()), change: (ratio, x, y) => to(v0 * ratio, x, y) });
  return { destroy() { a.destroy(); b.destroy(); } };
}

// Browser-style auto-scroll with the middle button. Press and release: scroll mode, the further the pointer is from the round marker
// (up or down) the faster the view moves; any click or Esc ends it. Press, hold and drag: scrolls while held. The middle click's own
// default (links, paste, the OS pan cursor) is cancelled. Vertical only, so right-to-left makes no difference.
export function autoScroll(node: HTMLElement) {
  let mark: HTMLElement | null = null, oy = 0, y = 0, raf = 0, last = 0, t0 = 0, held = false, moved = false;
  const stop = () => {
    cancelAnimationFrame(raf); raf = 0; mark?.remove(); mark = null; held = false;
    node.style.cursor = ''; removeEventListener('pointermove', move, true); removeEventListener('pointerdown', click, true); removeEventListener('keydown', key, true);
  };
  const tick = (now: number) => {
    const d = y - oy, v = Math.abs(d) < 10 ? 0 : (d - Math.sign(d) * 10) * 0.12 * Math.min(2, (now - last) / 16.7); // px per frame, 60 fps
    last = now; node.scrollTop += v; raf = requestAnimationFrame(tick);
  };
  const move = (e: PointerEvent) => { y = e.clientY; if (Math.abs(y - oy) > 6) moved = true; };
  const click = (e: Event) => { if (!held) { e.preventDefault(); e.stopPropagation(); stop(); } };
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); stop(); } };
  const down = (e: PointerEvent) => {
    if (e.button !== 1) return;
    e.preventDefault(); e.stopPropagation();
    if (raf) { stop(); return; }
    oy = y = e.clientY; t0 = performance.now(); held = true; moved = false; last = t0;
    mark = document.createElement('div'); mark.className = 'autoscroll-mark';
    mark.style.cssText = `position:fixed;z-index:9999;left:${e.clientX - 14}px;top:${oy - 14}px;width:28px;height:28px;box-sizing:border-box;border:2px solid var(--green,#15775d);border-radius:50%;background:var(--mint,#eaf3eb);opacity:.92;pointer-events:none`;
    mark.setAttribute('aria-hidden', 'true');
    document.body.append(mark); node.style.cursor = 'all-scroll';
    addEventListener('pointermove', move, true); addEventListener('pointerdown', click, true); addEventListener('keydown', key, true);
    raf = requestAnimationFrame(tick);
  };
  const up = (e: PointerEvent) => { if (e.button === 1 && held) { held = false; if (moved || performance.now() - t0 > 350) stop(); } }; // a short press stays on; a drag ends on release
  const swallow = (e: MouseEvent) => { if (e.button === 1) e.preventDefault(); }; // mousedown/auxclick: no link opening, paste or OS autoscroll
  node.addEventListener('pointerdown', down); addEventListener('pointerup', up, true);
  node.addEventListener('mousedown', swallow); node.addEventListener('auxclick', swallow);
  return { destroy() { stop(); node.removeEventListener('pointerdown', down); removeEventListener('pointerup', up, true); node.removeEventListener('mousedown', swallow); node.removeEventListener('auxclick', swallow); } };
}
