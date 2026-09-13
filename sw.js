/**
 * Service worker — omogućava da aplikacija radi i bez mreže.
 *
 * Ljuska (HTML, CSS, JS, ikonice) ide iz keša i odmah se iscrtava.
 * Podaci uvek prvo idu na mrežu; keš je rezerva kad mreže nema, uz jasnu
 * poruku u aplikaciji koliko su podaci stari.
 */
const VERSION = 'v5';
const SHELL = `ljuska-${VERSION}`;
const DATA = `podaci-${VERSION}`;
const FONTS = `fontovi-${VERSION}`;

const SHELL_FILES = [
  './', './index.html',
  './assets/css/style.css',
  './assets/js/app.js', './assets/js/api.js', './assets/js/charts.js',
  './assets/js/astro.js', './assets/js/format.js', './assets/js/weather-codes.js',
  './manifest.webmanifest',
  './assets/icons/icon-192.png', './assets/icons/apple-touch-icon.png',
  './assets/brand/sidekick.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => ![SHELL, DATA, FONTS].includes(k)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

const isApi = (url) => url.hostname.endsWith('open-meteo.com');
const isFont = (url) => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Podaci: mreža prvo, keš kao rezerva.
  if (isApi(url)) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(DATA).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Fontovi: keš prvo, da aplikacija izgleda isto i bez mreže.
  if (isFont(url)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(FONTS).then((cache) => cache.put(request, copy));
        return res;
      }).catch(() => cached))
    );
    return;
  }

  // Ljuska: keš prvo, uz tihо osvežavanje u pozadini.
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((res) => {
            const copy = res.clone();
            caches.open(SHELL).then((cache) => cache.put(request, copy));
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});
