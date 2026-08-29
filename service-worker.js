const CACHE_NAME = 'tableros-qr-v1';
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

  // Datos del tablero (API de Apps Script): red primero, y si falla,
  // se devuelve la última respuesta guardada en caché para ese mismo tablero
  // (permite ver el último dato conocido sin conexión).
  if (url.origin.includes('script.google.com') || url.origin.includes('googleusercontent.com')) {
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Resto de archivos (shell de la app): caché primero, red como respaldo.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
