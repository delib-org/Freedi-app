/**
 * Safe wrappers around localStorage / sessionStorage.
 *
 * Web Storage is not always usable: it can be `null` in some embedded webviews,
 * throw on access when cookies are blocked, and throw QuotaExceededError on write
 * in Safari private browsing. Every call site in the app should go through here
 * instead of touching `localStorage` / `sessionStorage` directly.
 *
 * When the real storage is unavailable we fall back to an in-memory map so that
 * callers still get consistent read-your-writes behaviour within the page session.
 */

type StorageKind = 'local' | 'session';

const memoryFallback: Record<StorageKind, Map<string, string>> = {
	local: new Map(),
	session: new Map(),
};

/**
 * Resolve the underlying Storage object, or null when it is unusable.
 * Access itself can throw (blocked cookies), hence the try/catch.
 */
function getStorage(kind: StorageKind): Storage | null {
	try {
		if (typeof window === 'undefined') return null;
		const storage = kind === 'local' ? window.localStorage : window.sessionStorage;
		if (!storage) return null;

		// Probe: some browsers expose the object but throw on use.
		const probeKey = '__freedi_storage_probe__';
		storage.setItem(probeKey, '1');
		storage.removeItem(probeKey);

		return storage;
	} catch {
		return null;
	}
}

// Resolved lazily once per page load — probing on every call is wasteful.
const resolved: Record<StorageKind, Storage | null | undefined> = {
	local: undefined,
	session: undefined,
};

function storageFor(kind: StorageKind): Storage | null {
	if (resolved[kind] === undefined) {
		resolved[kind] = getStorage(kind);
	}

	return resolved[kind] ?? null;
}

function read(kind: StorageKind, key: string): string | null {
	const storage = storageFor(kind);
	if (!storage) return memoryFallback[kind].get(key) ?? null;

	try {
		const value = storage.getItem(key);

		// A miss can mean the write failed (quota exceeded after a successful
		// probe), so consult the memory mirror before reporting "not set".
		// `removeItem` clears both, so this only shadows cross-tab deletions.
		return value ?? memoryFallback[kind].get(key) ?? null;
	} catch {
		return memoryFallback[kind].get(key) ?? null;
	}
}

function write(kind: StorageKind, key: string, value: string): void {
	memoryFallback[kind].set(key, value);
	const storage = storageFor(kind);
	if (!storage) return;

	try {
		storage.setItem(key, value);
	} catch {
		// Quota exceeded / private browsing — the memory fallback already holds it.
	}
}

function remove(kind: StorageKind, key: string): void {
	memoryFallback[kind].delete(key);
	const storage = storageFor(kind);
	if (!storage) return;

	try {
		storage.removeItem(key);
	} catch {
		// Nothing more we can do.
	}
}

export const safeLocalStorage = {
	getItem: (key: string): string | null => read('local', key),
	setItem: (key: string, value: string): void => write('local', key, value),
	removeItem: (key: string): void => remove('local', key),
	isAvailable: (): boolean => storageFor('local') !== null,
};

export const safeSessionStorage = {
	getItem: (key: string): string | null => read('session', key),
	setItem: (key: string, value: string): void => write('session', key, value),
	removeItem: (key: string): void => remove('session', key),
	isAvailable: (): boolean => storageFor('session') !== null,
};

/**
 * Read and JSON.parse a value, returning `fallback` on any failure.
 */
export function readJSON<T>(kind: StorageKind, key: string, fallback: T): T {
	const raw = read(kind, key);
	if (!raw) return fallback;

	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

/**
 * JSON.stringify and store a value. Silently no-ops when storage is unusable.
 */
export function writeJSON(kind: StorageKind, key: string, value: unknown): void {
	try {
		write(kind, key, JSON.stringify(value));
	} catch {
		// Value was not serialisable — nothing to store.
	}
}
