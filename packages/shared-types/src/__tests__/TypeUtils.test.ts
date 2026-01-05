/**
 * Tests for TypeUtils - utility functions for type operations
 */

import { isMember, maxKeyInObject, getRandomUID } from '../models/TypeUtils';
import { Role } from '../models/user/UserSettings';

describe('TypeUtils', () => {
	describe('isMember', () => {
		it('should return true for admin role', () => {
			expect(isMember(Role.admin)).toBe(true);
		});

		it('should return true for member role', () => {
			expect(isMember(Role.member)).toBe(true);
		});

		it('should return true for creator role', () => {
			expect(isMember(Role.creator)).toBe(true);
		});

		it('should return false for banned role', () => {
			expect(isMember(Role.banned)).toBe(false);
		});

		it('should return false for waiting role', () => {
			expect(isMember(Role.waiting)).toBe(false);
		});

		it('should return false for unsubscribed role', () => {
			expect(isMember(Role.unsubscribed)).toBe(false);
		});

		it('should return false for undefined', () => {
			expect(isMember(undefined)).toBe(false);
		});
	});

	describe('maxKeyInObject', () => {
		beforeEach(() => {
			jest.spyOn(console, 'error').mockImplementation(() => {});
		});

		afterEach(() => {
			jest.restoreAllMocks();
		});

		it('should return the key with maximum value', () => {
			const obj = { a: 1, b: 5, c: 3 };
			expect(maxKeyInObject(obj)).toBe('b');
		});

		it('should return first key for single-item object', () => {
			const obj = { only: 42 };
			expect(maxKeyInObject(obj)).toBe('only');
		});

		it('should handle negative values', () => {
			const obj = { a: -5, b: -1, c: -10 };
			expect(maxKeyInObject(obj)).toBe('b');
		});

		it('should handle mix of positive and negative values', () => {
			const obj = { negative: -10, zero: 0, positive: 5 };
			expect(maxKeyInObject(obj)).toBe('positive');
		});

		it('should return first maximum key when there are ties', () => {
			const obj = { first: 10, second: 10, third: 5 };
			// Should return the first one encountered with max value
			expect(maxKeyInObject(obj)).toBe('first');
		});

		it('should handle all zeros', () => {
			const obj = { a: 0, b: 0, c: 0 };
			expect(maxKeyInObject(obj)).toBe('a');
		});

		it('should handle floating point values', () => {
			const obj = { a: 0.1, b: 0.5, c: 0.3 };
			expect(maxKeyInObject(obj)).toBe('b');
		});

		it('should return empty string for undefined object', () => {
			const result = maxKeyInObject(undefined as unknown as Record<string, number>);
			expect(result).toBe('');
			expect(console.error).toHaveBeenCalled();
		});

		it('should handle empty object gracefully', () => {
			const obj = {};
			const result = maxKeyInObject(obj);
			// Returns undefined key since Object.keys returns empty array
			expect(result).toBe(undefined);
		});
	});

	describe('getRandomUID', () => {
		it('should return string of default length (12)', () => {
			const uid = getRandomUID();
			expect(typeof uid).toBe('string');
			expect(uid.length).toBe(12);
		});

		it('should return string of specified length', () => {
			expect(getRandomUID(5).length).toBe(5);
			expect(getRandomUID(20).length).toBe(20);
			expect(getRandomUID(1).length).toBe(1);
		});

		it('should return empty string for zero length', () => {
			expect(getRandomUID(0)).toBe('');
		});

		it('should only contain valid characters', () => {
			const validChars =
				'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-0123456789';
			const uid = getRandomUID(100);

			for (const char of uid) {
				expect(validChars).toContain(char);
			}
		});

		it('should generate unique values', () => {
			const uids = new Set<string>();
			const iterations = 100;

			for (let i = 0; i < iterations; i++) {
				uids.add(getRandomUID());
			}

			// All generated UIDs should be unique
			expect(uids.size).toBe(iterations);
		});

		it('should generate different values on consecutive calls', () => {
			const uid1 = getRandomUID();
			const uid2 = getRandomUID();
			const uid3 = getRandomUID();

			// Very unlikely to be the same
			expect(uid1).not.toBe(uid2);
			expect(uid2).not.toBe(uid3);
			expect(uid1).not.toBe(uid3);
		});

		it('should handle large length values', () => {
			const uid = getRandomUID(1000);
			expect(uid.length).toBe(1000);
		});
	});
});
