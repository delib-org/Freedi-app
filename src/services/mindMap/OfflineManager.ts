import { MindMapData, MindMapNode } from './types';
import { logError } from '@/utils/errorHandling';
import { MINDMAP_CONFIG } from '@/constants/mindMap';

// Define types for serialized data
interface SerializedNode {
	statement: MindMapNode['statement'];
	children: SerializedNode[];
	depth: number;
	isExpanded: boolean;
	isLoading: boolean;
}

interface SerializedMindMapData {
	rootStatement: MindMapData['rootStatement'];
	tree: SerializedNode;
	allStatements: MindMapData['allStatements'];
	nodes: Array<{ id: string; node: SerializedNode }>;
	loadingState: MindMapData['loadingState'];
	error: MindMapData['error'];
}

/**
 * Offline manager for mind-map data using IndexedDB
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

	/**
	 * Get singleton instance
	 */
	public static getInstance(): OfflineManager {
		if (!OfflineManager.instance) {
			OfflineManager.instance = new OfflineManager();
		}

		return OfflineManager.instance;
	}

	/**
	 * Initialize IndexedDB
	 */
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

				// Set up periodic sync
				this.setupPeriodicSync();
			};

			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;

				// Create object store for mind-map data
				if (!db.objectStoreNames.contains(this.STORE_NAME)) {
					const store = db.createObjectStore(this.STORE_NAME, {
						keyPath: 'statementId',
					});

					// Create indexes for efficient querying
					store.createIndex('timestamp', 'timestamp', { unique: false });
					store.createIndex('parentId', 'rootStatement.parentId', { unique: false });
					store.createIndex('topParentId', 'rootStatement.topParentId', { unique: false });
				}

				// Create object store for pending updates
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

	/**
	 * Save mind-map data for offline access
	 */
	public async saveMindMap(data: MindMapData): Promise<void> {
		if (!this.db) {
			await this.waitForDB();
		}

		try {
			const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
			const store = transaction.objectStore(this.STORE_NAME);

			// Serialize the data for storage
			const serialized = this.serializeMindMapData(data);

			// Add timestamp and metadata
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

	/**
	 * Load mind-map data from offline storage
	 */
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

					// Check if data is still fresh
					const age = Date.now() - record.timestamp;
					if (age > MINDMAP_CONFIG.PERFORMANCE.CACHE_TTL * 2) {
						console.info(`[OfflineManager] Offline data expired for: ${statementId}`);
						// Delete expired data
						this.deleteMindMap(statementId);
						resolve(null);

						return;
					}

					// Deserialize the data
					const data = this.deserializeMindMapData(record);

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

	/**
	 * Delete mind-map from offline storage
	 */
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

	/**
	 * Save pending update for later sync
	 */
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

	/**
	 * Get all pending updates
	 */
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

	/**
	 * Delete pending update after successful sync
	 */
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

	/**
	 * Sync pending updates when online
	 */
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
					// Process update based on type
					await this.processPendingUpdate(update);

					// Delete after successful processing
					if (update.id) {
						await this.deletePendingUpdate(update.id);
					}
				} catch (error) {
					// Update retry count
					if (update.id) {
						await this.updateRetryCount(update.id);
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

	/**
	 * Process a pending update
	 */
	private async processPendingUpdate(update: PendingUpdate): Promise<void> {
		// This would integrate with your Firebase update functions
		switch (update.type) {
			case 'CREATE_STATEMENT':
			case 'UPDATE_STATEMENT':
			case 'DELETE_STATEMENT':
			case 'MOVE_STATEMENT':
				// Call appropriate Firebase function
				console.info(`[OfflineManager] Processing ${update.type} for ${update.statementId}`);
				// Actual implementation would call Firebase functions here
				break;
			default:
				console.error(`[OfflineManager] Unknown update type: ${update.type}`);
		}
	}

	/**
	 * Update retry count for failed sync
	 */
	private async updateRetryCount(id: number): Promise<void> {
		if (!this.db) return;

		try {
			const transaction = this.db.transaction([this.PENDING_STORE], 'readwrite');
			const store = transaction.objectStore(this.PENDING_STORE);
			const request = store.get(id);

			request.onsuccess = () => {
				const update = request.result;
				if (update) {
					update.retryCount = (update.retryCount || 0) + 1;
					update.lastRetry = Date.now();

					// Delete if too many retries
					if (update.retryCount > 5) {
						store.delete(id);
						console.error(`[OfflineManager] Dropping update after 5 retries: ${id}`);
					} else {
						store.put(update);
					}
				}
			};
		} catch (error) {
			logError(error, {
				operation: 'OfflineManager.updateRetryCount',
				metadata: { updateId: id },
			});
		}
	}

	/**
	 * Get storage statistics
	 */
	public async getStorageStats(): Promise<StorageStats> {
		if (!this.db) {
			await this.waitForDB();
		}

		try {
			const transaction = this.db!.transaction([this.STORE_NAME, this.PENDING_STORE], 'readonly');
			const mindMapStore = transaction.objectStore(this.STORE_NAME);
			const pendingStore = transaction.objectStore(this.PENDING_STORE);

			const [mindMapCount, pendingCount] = await Promise.all([
				this.getCount(mindMapStore),
				this.getCount(pendingStore),
			]);

			// Estimate storage size (rough calculation)
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

	/**
	 * Clear all offline data
	 */
	public async clearAll(): Promise<void> {
		if (!this.db) {
			await this.waitForDB();
		}

		try {
			const transaction = this.db!.transaction([this.STORE_NAME, this.PENDING_STORE], 'readwrite');
			const mindMapStore = transaction.objectStore(this.STORE_NAME);
			const pendingStore = transaction.objectStore(this.PENDING_STORE);

			await Promise.all([this.clearStore(mindMapStore), this.clearStore(pendingStore)]);

			console.info('[OfflineManager] Cleared all offline data');
		} catch (error) {
			logError(error, {
				operation: 'OfflineManager.clearAll',
			});
		}
	}

	/**
	 * Setup periodic sync
	 */
	private setupPeriodicSync(): void {
		// Sync when coming online
		window.addEventListener('online', () => {
			console.info('[OfflineManager] Network online - syncing updates');
			this.syncPendingUpdates();
		});

		// Periodic sync every 5 minutes when online
		setInterval(
			() => {
				if (navigator.onLine) {
					this.syncPendingUpdates();
				}
			},
			5 * 60 * 1000,
		);

		// Clean old data periodically
		setInterval(
			() => {
				this.cleanOldData();
			},
			30 * 60 * 1000,
		);
	}

	/**
	 * Clean old offline data
	 */
	private async cleanOldData(): Promise<void> {
		if (!this.db) return;

		try {
			const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
			const store = transaction.objectStore(this.STORE_NAME);
			const index = store.index('timestamp');

			// Get all records
			const request = index.openCursor();

			request.onsuccess = () => {
				const cursor = request.result;
				if (cursor) {
					const record = cursor.value;
					const age = Date.now() - record.timestamp;

					// Delete if older than 7 days
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

	/**
	 * Serialize mind-map data for storage
	 */
	private serializeMindMapData(data: MindMapData): SerializedMindMapData {
		// Convert Map to array for storage
		const nodesArray = Array.from(data.nodeMap.entries()).map(([id, node]) => ({
			id,
			node: this.serializeNode(node),
		}));

		return {
			rootStatement: data.rootStatement,
			tree: this.serializeNode(data.tree),
			allStatements: data.allStatements,
			nodes: nodesArray,
			loadingState: data.loadingState,
			error: data.error,
		};
	}

	/**
	 * Serialize a node
	 */
	private serializeNode(node: MindMapNode): SerializedNode {
		return {
			statement: node.statement,
			children: node.children.map((child) => this.serializeNode(child)),
			depth: node.depth,
			isExpanded: node.isExpanded,
			isLoading: node.isLoading,
		};
	}

	/**
	 * Deserialize mind-map data from storage
	 */
	private deserializeMindMapData(record: SerializedMindMapData): MindMapData {
		// Convert array back to Map
		const nodeMap = new Map<string, MindMapNode>();

		if (record.nodes) {
			record.nodes.forEach((entry) => {
				nodeMap.set(entry.id, this.deserializeNode(entry.node));
			});
		}

		return {
			rootStatement: record.rootStatement,
			tree: this.deserializeNode(record.tree),
			allStatements: record.allStatements,
			nodeMap,
			loadingState: record.loadingState,
			error: record.error,
		};
	}

	/**
	 * Deserialize a node
	 */
	private deserializeNode(data: SerializedNode): MindMapNode {
		return {
			statement: data.statement,
			children: data.children?.map((child) => this.deserializeNode(child)) || [],
			depth: data.depth,
			isExpanded: data.isExpanded,
			isLoading: data.isLoading,
		};
	}

	/**
	 * Helper: Get count from object store
	 */
	private getCount(store: IDBObjectStore): Promise<number> {
		return new Promise((resolve) => {
			const request = store.count();
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => resolve(0);
		});
	}

	/**
	 * Helper: Clear object store
	 */
	private clearStore(store: IDBObjectStore): Promise<void> {
		return new Promise((resolve) => {
			const request = store.clear();
			request.onsuccess = () => resolve();
			request.onerror = () => resolve();
		});
	}

	/**
	 * Wait for database to be ready
	 */
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

// Types
interface PendingUpdate {
	id?: number;
	type: 'CREATE_STATEMENT' | 'UPDATE_STATEMENT' | 'DELETE_STATEMENT' | 'MOVE_STATEMENT';
	statementId: string;
	data: Record<string, unknown>;
	timestamp?: number;
	retryCount?: number;
	lastRetry?: number;
}

interface StorageStats {
	mindMapCount: number;
	pendingUpdateCount: number;
	estimatedSizeBytes: number;
	quotaBytes: number;
	isOnline: boolean;
}

// Export singleton instance
export const offlineManager = OfflineManager.getInstance();
