const fs = require('fs');
const vm = require('vm');
const path = require('path');
const source = fs.readFileSync(
	path.join(__dirname, '../../../public/firebase-messaging-sw.js'),
	'utf8',
);
function worker() {
	const handlers = {};
	let background;
	const showNotification = jest.fn().mockResolvedValue(undefined);
	const badge = {
		update: jest.fn().mockResolvedValue({ count: 3 }),
		apply: jest.fn().mockResolvedValue(undefined),
	};
	const self = {
		location: { hostname: 'wizcol.com', origin: 'https://wizcol.com' },
		addEventListener: (name, handler) => {
			handlers[name] = handler;
		},
		registration: { showNotification },
		clients: {
			matchAll: jest.fn().mockResolvedValue([]),
			openWindow: jest.fn().mockResolvedValue(null),
		},
	};
	const context = {
		self,
		clients: self.clients,
		FreeDiBadgeStore: badge,
		importScripts: jest.fn(),
		firebase: {
			initializeApp: jest.fn(),
			messaging: () => ({
				onBackgroundMessage: (callback) => {
					background = callback;
				},
			}),
		},
		console: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
		URL,
		setTimeout,
	};
	vm.runInNewContext(source, context);
	return { background, handlers, showNotification, badge, self };
}
it('registers synchronously and updates badges without duplicating Firebase notifications', async () => {
	const w = worker();
	expect(w.background).toBeDefined();
	await w.background({
		notification: { title: 'Reply', body: 'Hello' },
		data: { statementId: 'reply', parentId: 'room' },
	});
	expect(w.badge.update).toHaveBeenCalledWith({ notificationId: 'statement:reply' });
	expect(w.badge.apply).toHaveBeenCalledWith(3);
	expect(w.showNotification).not.toHaveBeenCalled();
});
it('shows exactly one notification for data-only pushes', async () => {
	const w = worker();
	await w.background({
		data: { title: 'Reply', body: 'Hello', statementId: 'reply', parentId: 'room' },
	});
	expect(w.showNotification).toHaveBeenCalledTimes(1);
});
it('opens the contribution on click without clearing unrelated unread updates', async () => {
	const w = worker();
	let finished;
	w.handlers.notificationclick({
		stopImmediatePropagation: jest.fn(),
		notification: {
			close: jest.fn(),
			data: {
				FCM_MSG: {
					data: { notificationType: 'statement_reply', parentId: 'room', statementId: 'reply' },
				},
			},
		},
		waitUntil: (promise) => {
			finished = promise;
		},
	});
	await finished;
	expect(w.self.clients.openWindow).toHaveBeenCalledWith(
		'https://wizcol.com/statement/room?tab=chat#reply',
	);
	expect(w.badge.update).not.toHaveBeenCalled();
	expect(w.badge.apply).not.toHaveBeenCalled();
});
