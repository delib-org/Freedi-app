import { logError } from '@/utils/errorHandling';
import { PendingUpdate } from './offlineTypes';

/**
 * Process a pending update by type
 */
export async function processPendingUpdate(update: PendingUpdate): Promise<void> {
	switch (update.type) {
		case 'CREATE_STATEMENT':
		case 'UPDATE_STATEMENT':
		case 'DELETE_STATEMENT':
		case 'MOVE_STATEMENT':
			console.info(`[OfflineSync] Processing ${update.type} for ${update.statementId}`);
			// Actual implementation would call Firebase functions here
			break;
		default:
			logError(new Error(`[OfflineSync] Unknown update type`), {
				operation: 'offlineSync.processPendingUpdate',
			});
	}
}

/**
 * Update retry count for a failed sync item in IndexedDB
 */
export async function updateRetryCount(
	db: IDBDatabase,
	pendingStoreName: string,
	id: number,
): Promise<void> {
	try {
		const transaction = db.transaction([pendingStoreName], 'readwrite');
		const store = transaction.objectStore(pendingStoreName);
		const request = store.get(id);

		request.onsuccess = () => {
			const update = request.result;
			if (update) {
				update.retryCount = (update.retryCount || 0) + 1;
				update.lastRetry = Date.now();

				if (update.retryCount > 5) {
					store.delete(id);
					logError(new Error(`[OfflineSync] Dropping update after 5 retries: ${id}`), {
						operation: 'offlineSync.updateRetryCount',
					});
				} else {
					store.put(update);
				}
			}
		};
	} catch (error) {
		logError(error, {
			operation: 'offlineSync.updateRetryCount',
			metadata: { updateId: id },
		});
	}
}

/**
 * Get count from an IDB object store
 */
export function getStoreCount(store: IDBObjectStore): Promise<number> {
	return new Promise((resolve) => {
		const request = store.count();
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => resolve(0);
	});
}

/**
 * Clear an IDB object store
 */
export function clearStore(store: IDBObjectStore): Promise<void> {
	return new Promise((resolve) => {
		const request = store.clear();
		request.onsuccess = () => resolve();
		request.onerror = () => resolve();
	});
}
