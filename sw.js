const CACHE = 'horrormeet-v12';
const SHELL = ['./index.html', './styles.css?v=7', './app.js?v=10', './rules.html', './manifest.webmanifest'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // never cache API calls
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
