/*
 * join-class push worker (IA 22.7): "someone replied to your proposal".
 *
 * Registered by the page at its own scope (/class-push/), apart from the PWA
 * worker at /, so it never fights the precache. It does NOT load the Firebase
 * SDK: the server sends data-only web pushes and this worker draws them, so
 * there is no Firebase version here to drift from node_modules (the page's SDK
 * owns firebase-messaging-database alone).
 *
 * A push is not shown when a join-class window is already visible: the app
 * says it in place (count + toast). `tag` is the proposal, so a newer push
 * replaces the older one. The body never carries reply text or a name.
 */

const ICON = '/icons/icon-192.png';
const BADGE = '/icons/icon-96.png';

function payloadOf(event) {
	if (!event.data) return null;
	try {
		const json = event.data.json();
		const data = json && typeof json.data === 'object' ? json.data : json;
		if (!data || typeof data.title !== 'string' || typeof data.body !== 'string') return null;

		return data;
	} catch (error) {
		console.error('[class-push-sw] unreadable push', error);

		return null;
	}
}

async function anyVisibleWindow() {
	const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

	return windows.some((client) => client.visibilityState === 'visible');
}

self.addEventListener('install', () => {
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
	const data = payloadOf(event);
	if (!data) return;
	event.waitUntil(
		(async () => {
			if (await anyVisibleWindow()) return;
			await self.registration.showNotification(data.title, {
				body: data.body,
				tag: data.tag || 'class-reply',
				renotify: true,
				icon: ICON,
				badge: BADGE,
				data: { url: data.url || '/' },
			});
		})(),
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const raw = (event.notification.data && event.notification.data.url) || '/';
	let target;
	try {
		const url = new URL(raw, self.location.origin);
		target = url.origin === self.location.origin ? url.href : self.location.origin + '/';
	} catch {
		target = self.location.origin + '/';
	}
	event.waitUntil(
		(async () => {
			const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
			// An open app window is not controlled by this worker (the PWA worker
			// owns /), so it cannot be navigated from here: focus it and tell the
			// page which replies to open. With no window, open one on the link.
			const open = windows.find((client) => 'focus' in client);
			if (open) {
				await open.focus();
				open.postMessage({ type: 'class-open-url', url: target });

				return;
			}
			await self.clients.openWindow(target);
		})(),
	);
});
