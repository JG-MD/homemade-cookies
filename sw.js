const CACHE_NAME = 'cookie-corner-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => clients.claim())
  );
});

// Network-first for same-origin GETs, caching each response as it's seen so
// the installed app can still open (showing the last-cached version) with
// no connection. Cross-origin requests (Supabase, the Supabase JS CDN) are
// left untouched — live data should never come from a stale cache, and a
// completely fresh install with zero prior successful visits still needs
// a network connection at least once before anything is cached.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        return res;
      })
      .catch(() =>
        caches.match(req).then(cached => cached || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))
      )
  );
});

self.addEventListener('push', e => {
  if (!e.data) return;
  const { title, body, url } = e.data.json();
  e.waitUntil(
    self.registration.showNotification(title || 'Cookie Corner', {
      body: body || '',
      icon: '/homemade-cookies/assets/app/app-logo192.png',
      badge: '/homemade-cookies/assets/app/app-logo192.png',
      vibrate: [200, 100, 200],
      data: { url: url || 'https://jg-md.github.io/homemade-cookies/' },
      actions: [{ action: 'open', title: 'Order Now' }],
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || 'https://jg-md.github.io/homemade-cookies/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.startsWith('https://jg-md.github.io/homemade-cookies') && 'focus' in c) {
          return c.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
