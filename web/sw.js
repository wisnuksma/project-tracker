/* Service worker: membuat aplikasi bisa dibuka cepat/offline dan menangani klik notifikasi.
 * Naikkan VERSION setiap kali file aplikasi diubah agar semua pengguna mendapat versi baru. */
const VERSION = 'pt-v2.1.0';
const SHELL = [
  './', 'index.html', 'styles.css', 'config.js', 'manifest.webmanifest',
  'js/logic.js', 'js/demo.js', 'js/pt-web.js', 'js/app.js', 'vendor/chart.umd.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/badge-96.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// File aplikasi: ambil dari jaringan dulu (agar selalu terbaru), pakai cache bila offline.
// Panggilan ke Apps Script (lintas domain, POST) tidak disentuh.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const taskId = e.notification.data && e.notification.data.taskId;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = all.find((c) => c.url.startsWith(self.registration.scope));
    if (client) {
      await client.focus();
      if (taskId) client.postMessage({ type: 'nav', taskId });
    } else {
      await self.clients.openWindow(self.registration.scope + (taskId ? '?task=' + encodeURIComponent(taskId) : ''));
    }
  })());
});
