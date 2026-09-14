/* Shared by the page and the classic Firebase worker. One atomic IDB transaction
 * per change avoids lost increments across tabs and worker restarts. */
(function (scope) {
	'use strict';
	function update({ count, userId, notificationId, notificationIds = [] } = {}) {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open('FreeDiNotifications', 1);
			request.onupgradeneeded = () => {
				if (!request.result.objectStoreNames.contains('badgeCounter'))
					request.result.createObjectStore('badgeCounter', { keyPath: 'id' });
			};
			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				const db = request.result;
				let transaction;
				try {
					transaction = db.transaction('badgeCounter', 'readwrite');
				} catch (error) {
					db.close();
					reject(error);
					return;
				}
				const store = transaction.objectStore('badgeCounter');
				let result;
				transaction.oncomplete = () => {
					db.close();
					resolve(result);
				};
				transaction.onerror = transaction.onabort = () => {
					db.close();
					reject(transaction.error);
				};
				const read = store.get('badge');
				read.onsuccess = () => {
					const previous = read.result || { id: 'badge', count: 0, seen: [] };
					const seen = Array.isArray(previous.seen) ? previous.seen : [];
					if (typeof count === 'number' && Number.isFinite(count)) {
						result = {
							id: 'badge',
							count: Math.max(0, Math.floor(count)),
							userId,
							signedOut: userId === null,
							seen: [
								...new Set([...(previous.userId === userId ? seen : []), ...notificationIds]),
							].slice(-500),
						};
					} else {
						// A sign-out suppresses late pushes from a token still being removed.
						const duplicate = notificationId && seen.includes(notificationId);
						result = {
							...previous,
							count: previous.signedOut || duplicate ? previous.count : (previous.count || 0) + 1,
							seen: notificationId
								? [...seen.filter((id) => id !== notificationId), notificationId].slice(-500)
								: seen,
						};
					}
					store.put(result);
				};
			};
		});
	}
	async function apply(count) {
		try {
			if (count === 0 && typeof scope.navigator.clearAppBadge === 'function')
				await scope.navigator.clearAppBadge();
			else if (typeof scope.navigator.setAppBadge === 'function')
				await scope.navigator.setAppBadge(count);
		} catch {
			/* Badging is optional; denied permissions must not break notifications. */
		}
	}
	scope.FreeDiBadgeStore = { update, apply };
})(globalThis);
