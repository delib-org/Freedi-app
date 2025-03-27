// This file will be merged with the workbox-generated service worker

// Force activation when a new version is available
self.addEventListener('install', (event) => {
  // Pre-cache the offline page
  event.waitUntil(
    caches.open('offline-cache').then((cache) => {
      return cache.add('/offline.html');
    }).then(() => {
      // Activate immediately
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  // Take control of all clients immediately
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Clean up old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.filter(cacheName => {
            // Delete old version caches
            return cacheName.startsWith('workbox-') && cacheName !== 'workbox-precache';
          }).map(cacheName => {
            return caches.delete(cacheName);
          })
        );
      })
    ])
  );
});

// Respond to a 'SKIP_WAITING' message to force service worker activation
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Show offline page when offline and navigation fails
self.addEventListener('fetch', (event) => {
  // Only handle navigation requests (HTML pages)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // If offline, serve the offline page
          return caches.match('/offline.html');
        })
    );
  }
  
  // For API requests, always try network first, then fall back to cache
  if (event.request.url.includes('firestore.googleapis.com') || 
      event.request.url.includes('firebase')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return caches.match(event.request);
        })
    );
  }
});