// The page editor's layer order for a selection of several: Bring to front / Forward / Backward / Send to back applied to
// every chosen layer at once. `all` is drawn back first (the editor's objs); `layer` says what the Layers panel lists,
// `on` what is chosen. Forward and Backward move each chosen layer one listed layer past an unchosen one (a block of
// chosen layers moves together); things the panel does not list keep their places.
export type To = 'front' | 'forward' | 'backward' | 'back';
export function restack<T>(all: T[], layer: (o: T) => boolean, on: (o: T) => boolean, to: To): T[] {
  if (to === 'front') return [...all.filter((o) => !on(o)), ...all.filter(on)];
  if (to === 'back') return [...all.filter(on), ...all.filter((o) => !on(o))];
  const slots = all.flatMap((o, i) => (layer(o) ? [i] : [])), list = slots.map((i) => all[i]);
  if (to === 'forward') { for (let i = list.length - 2; i >= 0; i--) if (on(list[i]) && !on(list[i + 1])) [list[i], list[i + 1]] = [list[i + 1], list[i]]; }
  else for (let i = 1; i < list.length; i++) if (on(list[i]) && !on(list[i - 1])) [list[i - 1], list[i]] = [list[i], list[i - 1]];
  const out = [...all];
  slots.forEach((s, k) => (out[s] = list[k]));
  return out;
}
