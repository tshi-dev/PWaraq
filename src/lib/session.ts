// Did the last run end badly? Every running Waraq holds a Web Lock named after its session id; a crash or a power cut
// releases it without a goodbye, a normal exit also removes the id from the list. An id in the list with no lock = a run
// that did not end cleanly (works with several tabs open, and in the desktop window).
// The desktop window can be gone before that list write reaches the disk, so closing it also leaves a `clean-exit` file in
// the vault (Rust writes it at once) naming the id. Only the living page writes it: a renderer that died never does.
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
  write([...before.filter((x) => held.has(lockName(x))), id]);
  addEventListener('pagehide', () => write(read().filter((x) => x !== id)));
  return dead.length > 0;
}

/** A normal exit (the window is closing): this run leaves the list before the window goes. Never throws. */
export async function endSession() {
  if (!current) return;
  write(read().filter((x) => x !== current));
  if (desktop()) try { await (await vault()).put(MARK, current); } catch { /* the list write above may still make it */ }
}
