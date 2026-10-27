// Waraq web-app worker. Scope = the folder it is served from (/app/). Caches only the app's own shell, engine and fonts
// (hashed, never change); documents and blobs never pass through here. BUILD is replaced at build time (vite.config.ts).
const CACHE = 'waraq-app-__BUILD__';
const SHELL = new URL('./', self.location).href;
const own = (u) => u.origin === self.location.origin && u.href.startsWith(SHELL);
const cacheable = (u) => /\/(assets|fonts)\//.test(u.pathname) || /\/(icon-.*\.png|apple-touch-icon\.png|brand-mark\.svg|manifest\.webmanifest)$/.test(u.pathname);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('waraq-app-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || !own(u)) return;
  if (r.mode === 'navigate') { // page: fresh when online, the saved shell when not
    e.respondWith(fetch(r).then((res) => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then((x) => x.put(SHELL, c)); } return res; }).catch(() => caches.match(SHELL).then((m) => m || Response.error())));
  } else if (cacheable(u)) { // hashed files: cache first
    e.respondWith(caches.match(r).then((m) => m || fetch(r).then((res) => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then((x) => x.put(r, c)); } return res; })));
  }
});
