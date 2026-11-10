// Did the last run end badly? Every running Waraq holds a Web Lock named after its session id; a crash or a power cut
// releases it without a goodbye, a normal exit also removes the id from the list. An id in the list with no lock = a run
// that did not end cleanly (works with several tabs open, and in the desktop window).
// The desktop window can be gone before that list write reaches the disk, so closing it also leaves a `clean-exit` file in
// the vault (Rust writes it at once) naming the id. Only the living page writes it: a renderer that died never does.
// A hidden page counts as ended too (a browser may discard a background tab or close without pagehide); it rejoins when
// shown again or restored from the back/forward cache. So only a run that dies while on screen is reported.
const LIST = 'waraq-sessions', MARK = 'clean-exit', lockName = (id: string) => 'waraq-run-' + id;
const read = (): string[] => { try { return JSON.parse(localStorage.getItem(LIST) ?? '[]'); } catch { return []; } };
const write = (ids: string[]) => { try { localStorage.setItem(LIST, JSON.stringify(ids)); } catch { /* private mode: no detection */ } };
const desktop = () => '__TAURI__' in globalThis;
const vault = () => import('./vault'); // only in the desktop app (keeps this file loadable in Node tests)
let current = '';

/** Registers this run; true when an earlier run ended badly. */
export async function startSession(): Promise<boolean> {
  const id = (current = Math.random().toString(36).slice(2)), locks = navigator.locks;
  if (!locks) return false;
  await new Promise<void>((ok) => { locks.request(lockName(id), () => { ok(); return new Promise(() => {}); }); }); // held until this page is gone
  const held = new Set((await locks.query()).held?.map((l) => l.name)), before = read();
  let clean = '';
  if (desktop()) try { const v = await vault(); clean = (await v.getText(MARK)) ?? ''; if (clean) await v.remove(MARK); } catch { /* no marker */ }
  const dead = before.filter((x) => !held.has(lockName(x)) && x !== clean);
  write([...before.filter((x) => held.has(lockName(x))), ...(document.visibilityState === 'hidden' ? [] : [id])]); // opened in a background tab: joins when shown
  const leave = () => write(read().filter((x) => x !== id));
  const back = () => { const ids = read(); if (current === id && !ids.includes(id)) write([...ids, id]); };
  addEventListener('pagehide', leave);
  addEventListener('pageshow', (e) => { if ((e as PageTransitionEvent).persisted) back(); });
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? leave() : back()));
  return dead.length > 0;
}

/** A normal exit (the window is closing): this run leaves the list before the window goes. Never throws. */
export async function endSession() {
  const id = current;
  if (!id) return;
  current = ''; // no rejoining after this
  write(read().filter((x) => x !== id));
  if (desktop()) try { await (await vault()).put(MARK, id); } catch { /* the list write above may still make it */ }
}
