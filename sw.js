self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

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
