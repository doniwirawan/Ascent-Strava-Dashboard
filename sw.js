const CACHE = 'strava-dash-__BUILD__';
const PRECACHE = ['/', '/callback'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    const hadOld = keys.some(k => k !== CACHE && k.startsWith('strava-dash-'));
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
    // If this is an UPDATE (an older version was cached), force-reload any open
    // tabs so users always see the new deploy without a manual hard-refresh.
    if (hadOld) {
      const cs = await self.clients.matchAll({ type: 'window' });
      cs.forEach(c => { try { c.navigate(c.url); } catch {} });
    }
  })());
});

self.addEventListener('fetch', e => {
  // Only cache same-origin GET requests; skip Strava/Supabase API calls
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname.includes('strava.com') || url.hostname.includes('supabase.co')) return;

  // Network-first: always try fresh, update cache, fall back to cache offline.
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok && url.origin === self.location.origin) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});
