'use strict';
const V = 'gastos-v4'; // súbelo (v2, v3...) cuando cambies archivos de la app
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'theme.js', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Solo archivos propios (GET). Google y Apps Script nunca pasan por la caché.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => {
      const net = fetch(e.request).then(r => {
        if (r.ok) { const copy = r.clone(); caches.open(V).then(c => c.put(e.request, copy)); }
        return r;
      }).catch(() => hit);
      e.waitUntil(net.catch(() => { }));
      return hit || net;
    })
  );
});
