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

// Cache JS and CSS with network-first to avoid stale module issues after deployments
registerRoute(
	({ request }) =>
		request.destination === 'script' || request.destination === 'style',
	new NetworkFirst({
		cacheName: 'static-resources',
		networkTimeoutSeconds: 5,
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
	console.info('[SW] Service worker installed');
	// Skip waiting to activate immediately and avoid stale cache issues
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	console.info('[SW] Service worker activated');
	// Take control of all clients immediately
	event.waitUntil(
		Promise.all([
			// Claim all clients
			self.clients.claim(),
			// Clear old static-resources cache to avoid stale module issues
			caches.open('static-resources').then((cache) => {
				return cache.keys().then((keys) => {
					return Promise.all(
						keys.map((key) => cache.delete(key))
					);
				});
			}),
		])
	);
});

// Listen for messages from the main thread
self.addEventListener('message', (event) => {
	if (event.data && event.data.type === 'SKIP_WAITING') {
		self.skipWaiting();
	}
});

// Handle fetch errors for dynamically imported modules
self.addEventListener('fetch', (event) => {
	// Only handle module script requests that might fail after deployment
	if (event.request.destination === 'script' && event.request.url.includes('/assets/')) {
		event.respondWith(
			fetch(event.request).catch((error) => {
				console.error('[SW] Failed to fetch module, triggering reload:', event.request.url);
				// Notify clients to reload
				self.clients.matchAll().then((clients) => {
					clients.forEach((client) => {
						client.postMessage({ type: 'MODULE_FETCH_FAILED', url: event.request.url });
					});
				});
				throw error;
			})
		);
	}
});
