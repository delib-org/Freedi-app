import { MindMapData } from './types';
import { logError } from '@/utils/errorHandling';
import { MINDMAP_CONFIG } from '@/constants/mindMap';
import { PendingUpdate, StorageStats } from './offlineTypes';
import { serializeMindMapData, deserializeMindMapData } from './offlineSerialization';
import { processPendingUpdate, updateRetryCount, getStoreCount, clearStore } from './offlineSync';

/**
 * Offline manager for mind-map data using IndexedDB
 * Facade over serialization, sync, and storage modules
 */
export class OfflineManager {
	private static instance: OfflineManager;
	private db: IDBDatabase | null = null;
	private readonly DB_NAME = 'FreediMindMapDB';
	private readonly DB_VERSION = 1;
	private readonly STORE_NAME = 'mindmaps';
	private readonly PENDING_STORE = 'pending_updates';

	private constructor() {
		this.initializeDB();
	}

	public static getInstance(): OfflineManager {
		if (!OfflineManager.instance) {
			OfflineManager.instance = new OfflineManager();
		}

		return OfflineManager.instance;
	}

	private async initializeDB(): Promise<void> {
		if (!('indexedDB' in window)) {
			console.info('[OfflineManager] IndexedDB not supported');

			return;
		}

		try {
			const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

			request.onerror = () => {
				logError(new Error('Failed to open IndexedDB'), {
					operation: 'OfflineManager.initializeDB',
					metadata: { error: request.error },
				});
			};

			request.onsuccess = () => {
				this.db = request.result;
				console.info('[OfflineManager] IndexedDB initialized successfully');
				this.setupPeriodicSync();
			};

			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;

				if (!db.objectStoreNames.contains(this.STORE_NAME)) {
					const store = db.createObjectStore(this.STORE_NAME, {
						keyPath: 'statementId',
					});
					store.createIndex('timestamp', 'timestamp', { unique: false });
					store.createIndex('parentId', 'rootStatement.parentId', { unique: false });
					store.createIndex('topParentId', 'rootStatement.topParentId', { unique: false });
				}

				if (!db.objectStoreNames.contains(this.PENDING_STORE)) {
					const pendingStore = db.createObjectStore(this.PENDING_STORE, {
						keyPath: 'id',
						autoIncrement: true,
					});
					pendingStore.createIndex('timestamp', 'timestamp', { unique: false });
					pendingStore.createIndex('statementId', 'statementId', { unique: false });
					pendingStore.createIndex('type', 'type', { unique: false });
				}

				console.info('[OfflineManager] Database schema created/updated');
			};
		} catch (error) {
			logError(error, {
				operation: 'OfflineManager.initializeDB',
			});
		}
	}

	public async saveMindMap(data: MindMapData): Promise<void> {
		if (!this.db) {
			await this.waitForDB();
		}

		try {
			const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
			const store = transaction.objectStore(this.STORE_NAME);

			const serialized = serializeMindMapData(data);

			const record = {
				...serialized,
				statementId: data.rootStatement.statementId,
				timestamp: Date.now(),
				version: 1,
				nodeCount: data.nodeMap.size,
			};

			const request = store.put(record);

			return new Promise((resolve, reject) => {
				request.onsuccess = () => {
					console.info(`[OfflineManager] Saved mind-map: ${data.rootStatement.statementId}`);
					resolve();
				};

				request.onerror = () => {
					logError(new Error('Failed to save mind-map'), {
						operation: 'OfflineManager.saveMindMap',
						statementId: data.rootStatement.statementId,
						metadata: { error: request.error },
					});
					reject(request.error);
				};
			});
		} catch (error) {
			logError(error, {
				operation: 'OfflineManager.saveMindMap',
				statementId: data.rootStatement?.statementId,
			});
			throw error;
		}
	}

	public async loadMindMap(statementId: string): Promise<MindMapData | null> {
		if (!this.db) {
			await this.waitForDB();
		}

		try {
			const transaction = this.db!.transaction([this.STORE_NAME], 'readonly');
			const store = transaction.objectStore(this.STORE_NAME);
			const request = store.get(statementId);

			return new Promise((resolve, reject) => {
				request.onsuccess = () => {
					const record = request.result;

					if (!record) {
						console.info(`[OfflineManager] No offline data for: ${statementId}`);
						resolve(null);

						return;
					}

					const age = Date.now() - record.timestamp;
					if (age > MINDMAP_CONFIG.PERFORMANCE.CACHE_TTL * 2) {
						console.info(`[OfflineManager] Offline data expired for: ${statementId}`);
						this.deleteMindMap(statementId);
						resolve(null);

						return;
					}

					const data = deserializeMindMapData(record);

					console.info(`[OfflineManager] Loaded offline mind-map: ${statementId}`);
					resolve(data);
				};

				request.onerror = () => {
					logError(new Error('Failed to load mind-map'), {
						operation: 'OfflineManager.loadMindMap',
						statementId,
						metadata: { error: request.error },
					});
					reject(request.error);
				};
			});
		} catch (error) {
			logError(error, {
				operation: 'OfflineManager.loadMindMap',
				statementId,
			});

			return null;
		}
	}

	public async deleteMindMap(statementId: string): Promise<void> {
		if (!this.db) {
			await this.waitForDB();
		}

		try {
			const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
			const store = transaction.objectStore(this.STORE_NAME);
			const request = store.delete(statementId);

			return new Promise((resolve, reject) => {
				request.onsuccess = () => {
					console.info(`[OfflineManager] Deleted mind-map: ${statementId}`);
					resolve();
				};

				request.onerror = () => {
					reject(request.error);
				};
			});
		} catch (error) {
			logError(error, {
				operation: 'OfflineManager.deleteMindMap',
				statementId,
			});
		}
	}

	public async savePendingUpdate(update: PendingUpdate): Promise<void> {
		if (!this.db) {
			await this.waitForDB();
		}

		try {
			const transaction = this.db!.transaction([this.PENDING_STORE], 'readwrite');
			const store = transaction.objectStore(this.PENDING_STORE);

			const record = {
				...update,
				timestamp: Date.now(),
				retryCount: 0,
			};

			const request = store.add(record);

			return new Promise((resolve, reject) => {
				request.onsuccess = () => {
					console.info(`[OfflineManager] Saved pending update: ${update.type}`);
					resolve();
				};

				request.onerror = () => {
					reject(request.error);
				};
			});
		} catch (error) {
			logError(error, {
				operation: 'OfflineManager.savePendingUpdate',
				metadata: { updateType: update.type },
			});
		}
	}

	public async getPendingUpdates(): Promise<PendingUpdate[]> {
		if (!this.db) {
			await this.waitForDB();
		}

		try {
			const transaction = this.db!.transaction([this.PENDING_STORE], 'readonly');
			const store = transaction.objectStore(this.PENDING_STORE);
			const request = store.getAll();

			return new Promise((resolve, reject) => {
				request.onsuccess = () => {
					const updates = request.result || [];
					console.info(`[OfflineManager] Found ${updates.length} pending updates`);
					resolve(updates);
				};

				request.onerror = () => {
					reject(request.error);
				};
			});
		} catch (error) {
			logError(error, {
				operation: 'OfflineManager.getPendingUpdates',
			});

			return [];
		}
	}

	public async deletePendingUpdate(id: number): Promise<void> {
		if (!this.db) {
			await this.waitForDB();
		}

		try {
			const transaction = this.db!.transaction([this.PENDING_STORE], 'readwrite');
			const store = transaction.objectStore(this.PENDING_STORE);
			store.delete(id);

			console.info(`[OfflineManager] Deleted pending update: ${id}`);
		} catch (error) {
			logError(error, {
				operation: 'OfflineManager.deletePendingUpdate',
				metadata: { updateId: id },
			});
		}
	}

	public async syncPendingUpdates(): Promise<void> {
		if (!navigator.onLine) {
			console.info('[OfflineManager] Offline - skipping sync');

			return;
		}

		try {
			const pendingUpdates = await this.getPendingUpdates();

			if (pendingUpdates.length === 0) {
				return;
			}

			console.info(`[OfflineManager] Syncing ${pendingUpdates.length} pending updates`);

			for (const update of pendingUpdates) {
				try {
					await processPendingUpdate(update);

					if (update.id) {
						await this.deletePendingUpdate(update.id);
					}
				} catch (error) {
					if (update.id && this.db) {
						await updateRetryCount(this.db, this.PENDING_STORE, update.id);
					}

					logError(error, {
						operation: 'OfflineManager.syncPendingUpdates',
						metadata: { update },
					});
				}
			}
		} catch (error) {
			logError(error, {
				operation: 'OfflineManager.syncPendingUpdates',
			});
		}
	}

	public async getStorageStats(): Promise<StorageStats> {
		if (!this.db) {
			await this.waitForDB();
		}

		try {
			const transaction = this.db!.transaction([this.STORE_NAME, this.PENDING_STORE], 'readonly');
			const mindMapStore = transaction.objectStore(this.STORE_NAME);
			const pendingStore = transaction.objectStore(this.PENDING_STORE);

			const [mindMapCount, pendingCount] = await Promise.all([
				getStoreCount(mindMapStore),
				getStoreCount(pendingStore),
			]);

			const estimatedSize = (await navigator.storage?.estimate?.()) || { usage: 0, quota: 0 };

			return {
				mindMapCount,
				pendingUpdateCount: pendingCount,
				estimatedSizeBytes: estimatedSize.usage || 0,
				quotaBytes: estimatedSize.quota || 0,
				isOnline: navigator.onLine,
			};
		} catch (error) {
			logError(error, {
				operation: 'OfflineManager.getStorageStats',
			});

			return {
				mindMapCount: 0,
				pendingUpdateCount: 0,
				estimatedSizeBytes: 0,
				quotaBytes: 0,
				isOnline: navigator.onLine,
			};
		}
	}

	public async clearAll(): Promise<void> {
		if (!this.db) {
			await this.waitForDB();
		}

		try {
			const transaction = this.db!.transaction([this.STORE_NAME, this.PENDING_STORE], 'readwrite');
			const mindMapStoreObj = transaction.objectStore(this.STORE_NAME);
			const pendingStoreObj = transaction.objectStore(this.PENDING_STORE);

			await Promise.all([clearStore(mindMapStoreObj), clearStore(pendingStoreObj)]);

			console.info('[OfflineManager] Cleared all offline data');
		} catch (error) {
			logError(error, {
				operation: 'OfflineManager.clearAll',
			});
		}
	}

	private setupPeriodicSync(): void {
		window.addEventListener('online', () => {
			console.info('[OfflineManager] Network online - syncing updates');
			this.syncPendingUpdates();
		});

		setInterval(
			() => {
				if (navigator.onLine) {
					this.syncPendingUpdates();
				}
			},
			5 * 60 * 1000,
		);

		setInterval(
			() => {
				this.cleanOldData();
			},
			30 * 60 * 1000,
		);
	}

	private async cleanOldData(): Promise<void> {
		if (!this.db) return;

		try {
			const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
			const store = transaction.objectStore(this.STORE_NAME);
			const index = store.index('timestamp');

			const request = index.openCursor();

			request.onsuccess = () => {
				const cursor = request.result;
				if (cursor) {
					const record = cursor.value;
					const age = Date.now() - record.timestamp;

					if (age > 7 * 24 * 60 * 60 * 1000) {
						cursor.delete();
						console.info(`[OfflineManager] Deleted old record: ${record.statementId}`);
					}

					cursor.continue();
				}
			};
		} catch (error) {
			logError(error, {
				operation: 'OfflineManager.cleanOldData',
			});
		}
	}

	private waitForDB(): Promise<void> {
		return new Promise((resolve) => {
			const checkDB = () => {
				if (this.db) {
					resolve();
				} else {
					setTimeout(checkDB, 100);
				}
			};
			checkDB();
		});
	}
}

// Re-export types for backward compatibility
export type { PendingUpdate, StorageStats } from './offlineTypes';

// Export singleton instance
export const offlineManager = OfflineManager.getInstance();
