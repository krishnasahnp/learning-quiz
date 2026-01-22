const STATIC_CACHE = 'learningpwa-static-v6';
const DATA_CACHE = 'learningpwa-data-v2';
const OFFLINE_URL = '/offline.html';

const APP_SHELL = [
  '/',
  '/index.html',
  '/about.html',
  '/journal.html',
  '/projects.html',
  '/quiz.html',
  '/journal',
  '/about',
  '/projects',
  '/quiz',
  '/css/style.css',
  '/js/main.js',
  '/js/script.js',
  '/js/storage.js',
  '/js/browser.js',
  '/js/journal-data.js',
  '/js/thirdparty.js',
  '/js/quiz.js',
  '/images/icon-192.png',
  '/images/icon-512.png',
  '/images/logo.png',
  '/images/profile.jpeg',
  '/manifest.json',
  OFFLINE_URL,
];

const NETWORK_FIRST_ENDPOINTS = ['/reflections', '/api/questions', '/api/leaderboard'];
const WARM_DATA_ENDPOINTS = ['/reflections', '/api/questions/technical'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' })))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => {
          if (![STATIC_CACHE, DATA_CACHE].includes(cacheName)) {
            return caches.delete(cacheName);
          }
          return null;
        })
      );
      // Warm critical data so it's available after first visit
      const dataCache = await caches.open(DATA_CACHE);
      await Promise.all(
        WARM_DATA_ENDPOINTS.map(async (endpoint) => {
          try {
            const response = await fetch(endpoint, { cache: 'no-store' });
            if (response.ok) {
              await dataCache.put(endpoint, response.clone());
            }
          } catch (_) {
            // Ignore warmup errors; will be fetched later
          }
        })
      );
    })()
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const { request } = event;
  const requestUrl = new URL(request.url);

  // Offline-ready navigations
  if (request.mode === 'navigate') {
    event.respondWith(pageHandler(request));
    return;
  }

  // API responses should be as fresh as possible but still cached for offline
  if (NETWORK_FIRST_ENDPOINTS.some((endpoint) => requestUrl.pathname.startsWith(endpoint))) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  // Static assets: cache-first for speed
  event.respondWith(cacheFirst(request, STATIC_CACHE));
});

async function pageHandler(request) {
  try {
    const networkResponse = await fetch(request);
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch (error) {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    return cache.match(OFFLINE_URL);
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const networkResponse = await fetch(request);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch (error) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    // As a last resort, try static cache too
    const staticCache = await caches.open(STATIC_CACHE);
    return staticCache.match(request);
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const networkResponse = await fetch(request);
  cache.put(request, networkResponse.clone());
  return networkResponse;
}
