/**
 * localStorage that survives being blocked (private windows, strict browser
 * settings): on failure the value lives in memory for this visit only.
 */
const memory = new Map<string, string>();

export const safeStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
	getItem(key) {
		// A write that failed lives only here, and it is the newest value: read it first.
		const remembered = memory.get(key);

		if (remembered !== undefined) return remembered;

		try {
			return window.localStorage.getItem(key);
		} catch {
			return null;
		}
	},
	setItem(key, value) {
		try {
			window.localStorage.setItem(key, value);
			memory.delete(key);
		} catch {
			memory.set(key, value);
		}
	},
	removeItem(key) {
		memory.delete(key);
		try {
			window.localStorage.removeItem(key);
		} catch {
			// Nothing stored to remove.
		}
	},
};
