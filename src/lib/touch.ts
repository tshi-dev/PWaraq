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
