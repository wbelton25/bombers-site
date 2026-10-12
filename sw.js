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

// Phone alerts (sent by push.js): show the notification and put a count on the app icon where supported.
self.addEventListener('push', e => {
  let m = {}; try { m = e.data ? e.data.json() : {}; } catch (err) {}
  e.waitUntil((async () => {
    await self.registration.showNotification(m.title || 'Bombers update', { body: m.body || '', icon: '/icon-192.png', badge: '/badge-96.png', tag: m.tag, data: { url: m.url || '/' } });
    if (navigator.setAppBadge) await navigator.setAppBadge((await self.registration.getNotifications()).length).catch(() => {});
  })());
});
// Tapping one opens the site (the tab already open, or the app) at the right screen.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const want = new URL(e.notification.data?.url || '/', location.origin);
    const open = (await clients.matchAll({ type: 'window', includeUncontrolled: true })).find(c => new URL(c.url).origin === location.origin);
    if (open) { const u = new URL(open.url); u.hash = want.hash; await open.focus(); await open.navigate(u.href).catch(() => {}); }
    else await clients.openWindow(want.href);
    const left = (await self.registration.getNotifications()).length;
    if (navigator.setAppBadge) await (left ? navigator.setAppBadge(left) : navigator.clearAppBadge()).catch(() => {});
  })());
});

self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  const key = keyOf(u);
  // Pages always ask the server (cheap when unchanged), never the browser's 10-minute copy, so a new version
  // shows on the next open. new Response(...) drops the "redirected" flag a navigation can't use (/team → /team/).
  const net = (r.mode === 'navigate' ? fetch(r.url, { cache: 'no-cache', credentials: 'same-origin' }).then(res => res.redirected ? new Response(res.body, res) : res) : fetch(r)).then(async res => {
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
