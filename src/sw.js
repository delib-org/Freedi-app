// Freedi PWA Service Worker
// This service worker is processed by vite-plugin-pwa with injectManifest strategy

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

// Clean up old caches
cleanupOutdatedCaches();

// Precache static assets (injected by workbox)
// Note: injectionPoint is null in config, so we handle precaching manually if needed

// Cache HTML with network-first strategy
registerRoute(
	({ request }) => request.destination === 'document',
	new NetworkFirst({
		cacheName: 'html-cache',
		plugins: [
			new CacheableResponsePlugin({
				statuses: [0, 200],
			}),
			new ExpirationPlugin({
				maxEntries: 10,
				maxAgeSeconds: 60 * 60, // 1 hour
			}),
		],
	})
);

// Cache JS and CSS with stale-while-revalidate
registerRoute(
	({ request }) =>
		request.destination === 'script' || request.destination === 'style',
	new StaleWhileRevalidate({
		cacheName: 'static-resources',
		plugins: [
			new CacheableResponsePlugin({
				statuses: [0, 200],
			}),
			new ExpirationPlugin({
				maxEntries: 50,
				maxAgeSeconds: 60 * 60 * 24, // 24 hours
			}),
		],
	})
);

// Cache images with cache-first strategy
registerRoute(
	({ request }) => request.destination === 'image',
	new CacheFirst({
		cacheName: 'image-cache',
		plugins: [
			new CacheableResponsePlugin({
				statuses: [0, 200],
			}),
			new ExpirationPlugin({
				maxEntries: 100,
				maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
			}),
		],
	})
);

// Cache fonts with cache-first strategy
registerRoute(
	({ request }) => request.destination === 'font',
	new CacheFirst({
		cacheName: 'font-cache',
		plugins: [
			new CacheableResponsePlugin({
				statuses: [0, 200],
			}),
			new ExpirationPlugin({
				maxEntries: 20,
				maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
			}),
		],
	})
);

// Firebase/Firestore requests - network first with short cache
registerRoute(
	({ url }) =>
		url.hostname.includes('firestore.googleapis.com') ||
		url.hostname.includes('firebase'),
	new NetworkFirst({
		cacheName: 'firebase-cache',
		networkTimeoutSeconds: 10,
		plugins: [
			new CacheableResponsePlugin({
				statuses: [0, 200],
			}),
			new ExpirationPlugin({
				maxEntries: 10,
				maxAgeSeconds: 60 * 5, // 5 minutes
			}),
		],
	})
);

// Handle service worker lifecycle events
self.addEventListener('install', (event) => {
	// Don't force immediate activation - let it wait for user interaction
	console.info('[SW] Service worker installed');
});

self.addEventListener('activate', (event) => {
	console.info('[SW] Service worker activated');
});

// Listen for messages from the main thread
self.addEventListener('message', (event) => {
	if (event.data && event.data.type === 'SKIP_WAITING') {
		self.skipWaiting();
	}
});
