/**
 * Safe wrappers around localStorage / sessionStorage.
 *
 * `typeof window !== 'undefined'` is not enough of a guard: some embedded
 * webviews expose `window` but leave `window.localStorage` as `null`, and
 * Safari private browsing throws on write. Both produced crashes on the
 * document route ("Cannot read properties of null (reading 'getItem')").
 *
 * When real storage is unusable we fall back to an in-memory map so callers
 * still get read-your-writes behaviour for the lifetime of the page.
 */

type StorageKind = 'local' | 'session';

const memoryFallback: Record<StorageKind, Map<string, string>> = {
  local: new Map(),
  session: new Map(),
};

const resolved: Record<StorageKind, Storage | null | undefined> = {
  local: undefined,
  session: undefined,
};

function probe(kind: StorageKind): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    const storage = kind === 'local' ? window.localStorage : window.sessionStorage;
    if (!storage) return null;

    const probeKey = '__sign_storage_probe__';
    storage.setItem(probeKey, '1');
    storage.removeItem(probeKey);

    return storage;
  } catch {
    return null;
  }
}

function storageFor(kind: StorageKind): Storage | null {
  if (resolved[kind] === undefined) {
    resolved[kind] = probe(kind);
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
    // Quota exceeded / private browsing — memory fallback already holds it.
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
