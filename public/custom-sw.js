// This file will be merged with the workbox-generated service worker

// Pre-cache the offline page without forcing immediate activation
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('offline-cache').then((cache) => {
      return cache.add('/offline.html');
    })
  );
});

// Clean up old caches on activation
self.addEventListener('activate', (event) => {
  event.waitUntil(
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
  );
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