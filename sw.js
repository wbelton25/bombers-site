// Offline copy of the site (home-screen app). Network first, so pages are current whenever there's signal;
// the last saved copy when there's none, or when the network takes over 6 s (one bar at the field).
// Only this site's own files are saved. Bump CACHE to throw away every saved copy.
const CACHE = 'bombers-v1';
const keyOf = u => (u.pathname.endsWith('/') || /\.[a-z0-9]+$/i.test(u.pathname) ? u.pathname : u.pathname + '/');   // ignore ?query; /team → /team/

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/', '/team/'])).catch(() => {}));
});
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  const key = keyOf(u);
  const net = fetch(r).then(async res => {
    if (res.ok) await (await caches.open(CACHE)).put(key, res.clone());
    return res;
  });
  e.waitUntil(net.catch(() => {}));
  e.respondWith((async () => {
    const saved = await caches.match(key);
    if (!saved) return net;
    return Promise.race([net.catch(() => saved), new Promise(ok => setTimeout(() => ok(saved), 6000))]);
  })());
});
