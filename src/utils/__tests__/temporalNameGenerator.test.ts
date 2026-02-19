/**
 * Tests for temporalNameGenerator
 *
 * Tests temporal name generation and uniqueness for anonymous users.
 */

import { generateTemporalName, clearUsedNames } from '../temporalNameGenerator';

describe('temporalNameGenerator', () => {
	beforeEach(() => {
		clearUsedNames();
	});

	describe('generateTemporalName', () => {
		it('should return a name in the format "Adjective Noun Number"', () => {
			const name = generateTemporalName();
			const parts = name.split(' ');
			expect(parts).toHaveLength(3);
			// First part should start with uppercase
			expect(parts[0][0]).toBe(parts[0][0].toUpperCase());
			// Second part should start with uppercase
			expect(parts[1][0]).toBe(parts[1][0].toUpperCase());
			// Third part should be a number
			expect(Number(parts[2])).toBeGreaterThanOrEqual(1);
			expect(Number(parts[2])).toBeLessThanOrEqual(999);
		});

		it('should generate unique names across multiple calls', () => {
			const names = new Set<string>();
			for (let i = 0; i < 20; i++) {
				names.add(generateTemporalName());
			}
			expect(names.size).toBe(20);
		});

		it('should use fallback after too many collisions', () => {
			// Mock Math.random to always return the same value, forcing collisions
			const originalRandom = Math.random;
			Math.random = jest.fn().mockReturnValue(0.5);

			// First call succeeds normally
			const firstName = generateTemporalName();
			expect(firstName).toBeTruthy();

			// Second call should hit the same name and eventually fallback
			const secondName = generateTemporalName();
			expect(secondName).toBeTruthy();
			// The fallback starts with "User " followed by a timestamp
			expect(secondName.startsWith('User ')).toBe(true);

			Math.random = originalRandom;
		});
	});

	describe('clearUsedNames', () => {
		it('should allow previously generated names to be generated again', () => {
			// Mock to get a deterministic name
			const originalRandom = Math.random;
			let callCount = 0;
			Math.random = jest.fn().mockImplementation(() => {
				callCount++;

				// Return deterministic values for first name
				return 0.1;
			});

			const name1 = generateTemporalName();
			clearUsedNames();
			callCount = 0;

			const name2 = generateTemporalName();

			// After clearing, the same deterministic values should produce the same name
			expect(name1).toBe(name2);

			Math.random = originalRandom;
		});
	});
});
