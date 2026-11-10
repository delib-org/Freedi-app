// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeStorage } from '../safeStorage';

const KEY = 'freedi_tables_test_key';

function blockWrites(): void {
	vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
		throw new Error('QuotaExceededError');
	});
}

describe('safeStorage', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		safeStorage.removeItem(KEY);
		window.localStorage.clear();
	});

	it('stores and reads through localStorage', () => {
		safeStorage.setItem(KEY, 'a');

		expect(window.localStorage.getItem(KEY)).toBe('a');
		expect(safeStorage.getItem(KEY)).toBe('a');
	});

	it('still reads a value whose write failed', () => {
		blockWrites();

		safeStorage.setItem(KEY, 'kept in memory');

		expect(safeStorage.getItem(KEY)).toBe('kept in memory');
	});

	it('reads the failed write and not the older stored value', () => {
		safeStorage.setItem(KEY, 'old');
		blockWrites();
		safeStorage.setItem(KEY, 'new');

		expect(safeStorage.getItem(KEY)).toBe('new');
	});

	it('goes back to localStorage once a write works again', () => {
		blockWrites();
		safeStorage.setItem(KEY, 'in memory');
		vi.restoreAllMocks();
		safeStorage.setItem(KEY, 'stored');
		window.localStorage.setItem(KEY, 'changed elsewhere');

		expect(safeStorage.getItem(KEY)).toBe('changed elsewhere');
	});

	it('forgets a removed value in both places', () => {
		blockWrites();
		safeStorage.setItem(KEY, 'in memory');
		vi.restoreAllMocks();
		safeStorage.removeItem(KEY);

		expect(safeStorage.getItem(KEY)).toBeNull();
	});
});
