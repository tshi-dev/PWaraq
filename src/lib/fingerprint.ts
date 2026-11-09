/** Cheap content fingerprint (FNV-1a over every 61st byte plus the ends): a same-size edit changes bytes all over a PDF's xref/trailer. shortcut: not collision-proof, only guards a cached report. */
export function fingerprint(b: Uint8Array): string {
  let h = 0x811c9dc5;
  const mix = (v: number) => { h = Math.imul(h ^ v, 0x01000193) >>> 0; };
  for (let i = 0; i < b.length; i += 61) mix(b[i]);
  for (let i = Math.max(0, b.length - 256); i < b.length; i++) mix(b[i]);
  for (let i = 0; i < Math.min(256, b.length); i++) mix(b[i]);
  return h.toString(36);
}
