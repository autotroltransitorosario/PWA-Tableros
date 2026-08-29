const CACHE_NAME = 'tableros-qr-v3';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Las consultas a datos del tablero (Apps Script) viajan como JSONP
  // (etiquetas <script> con un parámetro "callback" distinto cada vez),
  // así que nunca conviene cachearlas: dejamos que vayan siempre a la red.
  if (url.origin.includes('script.google.com') || url.origin.includes('googleusercontent.com')) {
    return;
  }

  // Resto de archivos (shell de la app): caché primero, red como respaldo.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
