/**
 * WizCol-Chat FCM background service worker.
 *
 * Lives at the origin root (`/firebase-messaging-sw.js`) — required by FCM.
 * A service worker cannot read Vite's `import.meta.env`, so the client passes
 * the Firebase config in the registration query string
 * (`/firebase-messaging-sw.js?apiKey=...&projectId=...&...`), which we parse
 * from `self.location.search`. The config values are public by design.
 */
/* eslint-env serviceworker */
/* global firebase, importScripts */

importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

const params = new URL(self.location).searchParams;
const firebaseConfig = {
	apiKey: params.get('apiKey'),
	authDomain: params.get('authDomain'),
	projectId: params.get('projectId'),
	storageBucket: params.get('storageBucket'),
	messagingSenderId: params.get('messagingSenderId'),
	appId: params.get('appId'),
};

if (firebaseConfig.projectId && firebaseConfig.messagingSenderId) {
	firebase.initializeApp(firebaseConfig);
	const messaging = firebase.messaging();

	messaging.onBackgroundMessage((payload) => {
		const notification = payload.notification || {};
		const data = payload.data || {};
		const title = notification.title || 'WizCol-Chat';
		const url = data.url || (data.statementId ? `/q/${data.statementId}` : '/');

		const options = {
			body: notification.body || '',
			icon: '/icons/wizcol-chat-192.png',
			badge: '/icons/wizcol-chat-48.png',
			tag: data.tag || data.statementId || 'wizcol-chat',
			data: { ...data, url },
			dir: data.dir || 'auto',
		};

		return self.registration.showNotification(title, options);
	});
} else {
	console.warn('[firebase-messaging-sw] Missing Firebase config in query string; push disabled.');
}

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = (event.notification.data && event.notification.data.url) || '/';

	event.waitUntil(
		(async () => {
			const clientList = await self.clients.matchAll({
				type: 'window',
				includeUncontrolled: true,
			});
			for (const client of clientList) {
				if (client.url.includes(url) && 'focus' in client) {
					return client.focus();
				}
			}
			if (self.clients.openWindow) {
				return self.clients.openWindow(url);
			}
		})(),
	);
});
