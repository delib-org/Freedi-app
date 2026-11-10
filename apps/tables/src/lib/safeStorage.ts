/**
 * localStorage that survives being blocked (private windows, strict browser
 * settings): on failure the value lives in memory for this visit only.
 */
const memory = new Map<string, string>();

export const safeStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
	getItem(key) {
		try {
			return window.localStorage.getItem(key);
		} catch {
			return memory.get(key) ?? null;
		}
	},
	setItem(key, value) {
		try {
			window.localStorage.setItem(key, value);
		} catch {
			memory.set(key, value);
		}
	},
	removeItem(key) {
		try {
			window.localStorage.removeItem(key);
		} catch {
			memory.delete(key);
		}
	},
};
