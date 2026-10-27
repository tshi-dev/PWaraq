// A page's picture drawn into its canvas when it scrolls into view, and again (after a short pause) when the page size changes
// (Redact, Forms, OCR, Comment show every page of the document). `use:lazy={[i, width]}`: a new width redraws at the new size.
import type { EnginePool } from './engine/pool';

export const lazyPage = (pool: () => EnginePool, key: string, scale: (page: number) => number, doc?: () => number) => (node: HTMLCanvasElement, arg: [number, number]) => {
  let [i] = arg, vis = false, drawn = 0, timer: ReturnType<typeof setTimeout>;
  const draw = () => {
    const s = scale(i) * Math.min(devicePixelRatio || 1, 2);
    if (!vis || s === drawn) return;
    drawn = s;
    pool().run<ImageBitmap>({ op: 'render', page: i, priority: 1, key: key + i, args: { doc: doc?.(), scale: s } })
      .then((bmp) => { node.width = bmp.width; node.height = bmp.height; node.getContext('2d')!.drawImage(bmp, 0, 0); bmp.close(); }).catch(() => { drawn = 0; });
  };
  const io = new IntersectionObserver(([e]) => { vis = e.isIntersecting; draw(); }, { rootMargin: '400px' });
  io.observe(node);
  return { update(a: [number, number]) { i = a[0]; clearTimeout(timer); timer = setTimeout(draw, 150); }, destroy: () => { io.disconnect(); clearTimeout(timer); } };
};
