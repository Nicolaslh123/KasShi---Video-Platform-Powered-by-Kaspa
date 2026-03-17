// KasShi Service Worker - Basic caching for PWA
const CACHE_NAME = 'kasshi-v2';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/api/static/kasshi-logo'
];

// Install - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip API calls (always need fresh data)
  if (event.request.url.includes('/api/')) return;
  
  // Check if this is a navigation request (HTML page)
  const isNavigationRequest = event.request.mode === 'navigate' ||
    (event.request.method === 'GET' && event.request.headers.get('accept')?.includes('text/html'));
  
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(async () => {
        // Fallback to cache
        const cached = await caches.match(event.request);
        if (cached) return cached;
        
        // For SPA navigation requests, serve cached index.html
        if (isNavigationRequest) {
          const indexCached = await caches.match('/');
          if (indexCached) return indexCached;
        }
        
        // Last resort - return a basic offline response
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      })
  );
});
