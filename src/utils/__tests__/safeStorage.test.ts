import { safeLocalStorage, safeSessionStorage, readJSON, writeJSON } from '../safeStorage';

/**
 * safeStorage resolves the underlying Storage object lazily and caches the
 * result, so each scenario needs a fresh module instance.
 */
function loadModule(): typeof import('../safeStorage') {
	let mod: typeof import('../safeStorage');
	jest.isolateModules(() => {
		mod = require('../safeStorage');
	});

	return mod!;
}

function stubStorage(kind: 'localStorage' | 'sessionStorage', value: unknown): void {
	Object.defineProperty(window, kind, {
		configurable: true,
		writable: true,
		value,
	});
}

describe('safeStorage', () => {
	const realLocal = window.localStorage;
	const realSession = window.sessionStorage;

	afterEach(() => {
		stubStorage('localStorage', realLocal);
		stubStorage('sessionStorage', realSession);
		jest.restoreAllMocks();
	});

	describe('with working storage', () => {
		it('round-trips a value through localStorage', () => {
			safeLocalStorage.setItem('alpha', 'one');

			expect(safeLocalStorage.getItem('alpha')).toBe('one');
			expect(window.localStorage.getItem('alpha')).toBe('one');
		});

		it('removes a value', () => {
			safeLocalStorage.setItem('beta', 'two');
			safeLocalStorage.removeItem('beta');

			expect(safeLocalStorage.getItem('beta')).toBeNull();
		});

		it('returns null for a missing key', () => {
			expect(safeLocalStorage.getItem('never-written')).toBeNull();
		});

		it('reports availability', () => {
			expect(safeLocalStorage.isAvailable()).toBe(true);
			expect(safeSessionStorage.isAvailable()).toBe(true);
		});
	});

	describe('when window.localStorage is null', () => {
		// The crash this module exists to prevent: some embedded webviews expose
		// `window` but leave `localStorage` as null, so `localStorage.getItem(...)`
		// throws "Cannot read properties of null (reading 'getItem')".
		it('does not throw and falls back to memory', () => {
			stubStorage('localStorage', null);
			const mod = loadModule();

			expect(() => mod.safeLocalStorage.getItem('gamma')).not.toThrow();
			expect(mod.safeLocalStorage.getItem('gamma')).toBeNull();

			mod.safeLocalStorage.setItem('gamma', 'three');
			expect(mod.safeLocalStorage.getItem('gamma')).toBe('three');
			expect(mod.safeLocalStorage.isAvailable()).toBe(false);
		});
	});

	describe('when storage access throws', () => {
		it('falls back to memory when the probe throws', () => {
			stubStorage('localStorage', {
				getItem: () => {
					throw new Error('SecurityError');
				},
				setItem: () => {
					throw new Error('SecurityError');
				},
				removeItem: () => {
					throw new Error('SecurityError');
				},
			});
			const mod = loadModule();

			mod.safeLocalStorage.setItem('delta', 'four');

			expect(mod.safeLocalStorage.getItem('delta')).toBe('four');
			expect(mod.safeLocalStorage.isAvailable()).toBe(false);
		});

		it('survives a setItem that throws after a successful probe', () => {
			let allowWrites = true;
			stubStorage('localStorage', {
				getItem: () => null,
				removeItem: () => undefined,
				setItem: () => {
					if (!allowWrites) throw new Error('QuotaExceededError');
				},
			});
			const mod = loadModule();
			// Probe runs on first use while writes still succeed.
			expect(mod.safeLocalStorage.isAvailable()).toBe(true);

			allowWrites = false;

			expect(() => mod.safeLocalStorage.setItem('eps', 'five')).not.toThrow();
			// Memory fallback keeps the value readable for this page load.
			expect(mod.safeLocalStorage.getItem('eps')).toBe('five');
		});
	});

	describe('JSON helpers', () => {
		it('round-trips an object', () => {
			writeJSON('local', 'obj', { count: 2 });

			expect(readJSON('local', 'obj', { count: 0 })).toEqual({ count: 2 });
		});

		it('returns the fallback for missing keys', () => {
			expect(readJSON('local', 'absent', { count: 7 })).toEqual({ count: 7 });
		});

		it('returns the fallback for malformed JSON', () => {
			safeLocalStorage.setItem('broken', '{not json');

			expect(readJSON('local', 'broken', null)).toBeNull();
		});
	});
});
