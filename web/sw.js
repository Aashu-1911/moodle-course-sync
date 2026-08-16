// Moodle Course Hub - PWA Service Worker
const CACHE_NAME = 'moodle-course-hub-v14';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './dashboard.html',
  './settings.html',
  './css/style.css',
  './js/config.js',
  './js/auth.js',
  './js/db.js',
  './js/dashboard.js',
  './js/settings.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// Install Service Worker and cache all application shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching App Shell...');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Service Worker and clean up stale caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing stale cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event handler: Serve network content first, fall back to cache (Network-first)
self.addEventListener('fetch', (event) => {
  // Only handle GET requests and skip Supabase API calls (which shouldn't be cached)
  if (event.request.method !== 'GET' || event.request.url.includes('supabase.co')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // If response is valid, update the cache dynamically
        if (response && response.status === 200 && (response.type === 'basic' || response.url.includes('jsdelivr.net'))) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch((err) => {
        console.warn('[Service Worker] Fetch failed, falling back to cache:', err);
        return caches.match(event.request)
          .then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
          });
      })
  );
});
