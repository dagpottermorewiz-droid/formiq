/* Formiq service worker.
   The app is one HTML file, so the shell is tiny and we can cache all of it up front.
   Bump CACHE whenever index.html changes, or phones will keep serving the old copy. */
var CACHE = 'formiq-v7';
var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return k === CACHE ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

/* Push arrives with no payload on purpose - see backend/worker.js. The worker proves
   it is us with VAPID; what the notification says is decided here. */
self.addEventListener('push', function (e) {
  var title = 'Formiq', body = 'Time to train. Open Formiq to log today.';
  if (e.data) {
    try { var d = e.data.json(); title = d.title || title; body = d.body || body; }
    catch (err) { /* bare push, keep the default */ }
  }
  e.waitUntil(self.registration.showNotification(title, {
    body: body,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: 'formiq-push',
    requireInteraction: false
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (ws) {
      for (var i = 0; i < ws.length; i++) {
        if ('focus' in ws[i]) return ws[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  /* Opening the app: always answer from cache so it starts with no signal at all. */
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html').then(function (hit) { return hit || fetch(req); })
    );
    return;
  }

  /* Google Fonts: cache on first use, then serve from cache for good. Without this
     the type falls back to system fonts the moment the phone is offline. */
  if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com') {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res && res.status === 200) c.put(req, res.clone());
          return res;
        }).catch(function () { return hit; });
      });
    }));
    return;
  }

  if (url.origin !== location.origin) return;
  e.respondWith(caches.match(req).then(function (hit) { return hit || fetch(req); }));
});
