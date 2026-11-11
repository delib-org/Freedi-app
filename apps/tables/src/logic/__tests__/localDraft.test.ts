import { describe, expect, it } from 'vitest';
import {
	loadMemory,
	markCancelledHere,
	rememberRegistration,
	unmarkCancelledHere,
} from '../localDraft';

function memoryStore(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
	const values = new Map<string, string>();

	return {
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => void values.set(key, value),
		removeItem: (key) => void values.delete(key),
	};
}

describe('registration memory', () => {
	it('drops the stored name when the person cancels', () => {
		const store = memoryStore();

		rememberRegistration('s1', 'u1', 'Dana Levi', store);
		markCancelledHere('s1', 'u1', store);

		expect(loadMemory('s1', 'u1', store)).toMatchObject({
			wasRegistered: true,
			cancelledHere: true,
			lastName: '',
		});
	});

	it('remembers the name again when the cancel failed and the record is seen', () => {
		const store = memoryStore();

		rememberRegistration('s1', 'u1', 'Dana Levi', store);
		markCancelledHere('s1', 'u1', store);
		unmarkCancelledHere('s1', 'u1', store);
		rememberRegistration('s1', 'u1', 'Dana Levi', store);

		expect(loadMemory('s1', 'u1', store).lastName).toBe('Dana Levi');
	});
});
