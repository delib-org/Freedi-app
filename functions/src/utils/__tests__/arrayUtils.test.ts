import { shuffleArray, getRandomSample } from '../arrayUtils';

describe('arrayUtils', () => {
	describe('shuffleArray', () => {
		it('should return a new array with the same elements', () => {
			const original = [1, 2, 3, 4, 5];
			const shuffled = shuffleArray(original);

			// Should have same length
			expect(shuffled).toHaveLength(original.length);

			// Should contain all the same elements
			expect(shuffled.sort()).toEqual(original.sort());

			// Should be a new array (not same reference)
			expect(shuffled).not.toBe(original);
		});

		it('should not mutate the original array', () => {
			const original = [1, 2, 3, 4, 5];
			const originalCopy = [...original];
			shuffleArray(original);

			expect(original).toEqual(originalCopy);
		});

		it('should handle empty arrays', () => {
			const empty: number[] = [];
			const result = shuffleArray(empty);

			expect(result).toEqual([]);
		});

		it('should handle single element arrays', () => {
			const single = ['only'];
			const result = shuffleArray(single);

			expect(result).toEqual(['only']);
		});

		it('should produce different orders (statistically)', () => {
			const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
			const results = new Set<string>();

			// Run shuffle multiple times
			for (let i = 0; i < 100; i++) {
				const shuffled = shuffleArray(array);
				results.add(JSON.stringify(shuffled));
			}

			// Should produce multiple different orderings
			// Probability of getting same order 100 times is virtually 0
			expect(results.size).toBeGreaterThan(10);
		});
	});

	describe('getRandomSample', () => {
		it('should return requested number of elements', () => {
			const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
			const sample = getRandomSample(array, 3);

			expect(sample).toHaveLength(3);
		});

		it('should return elements from the original array', () => {
			const array = ['a', 'b', 'c', 'd', 'e'];
			const sample = getRandomSample(array, 2);

			sample.forEach((element) => {
				expect(array).toContain(element);
			});
		});

		it('should handle size larger than array length', () => {
			const array = [1, 2, 3];
			const sample = getRandomSample(array, 5);

			expect(sample).toHaveLength(3);
			expect(sample.sort()).toEqual([1, 2, 3]);
		});

		it('should handle size of 0', () => {
			const array = [1, 2, 3, 4, 5];
			const sample = getRandomSample(array, 0);

			expect(sample).toEqual([]);
		});

		it('should not mutate original array', () => {
			const original = [1, 2, 3, 4, 5];
			const originalCopy = [...original];
			getRandomSample(original, 3);

			expect(original).toEqual(originalCopy);
		});

		it('should return different samples (statistically)', () => {
			const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
			const samples = new Set<string>();

			// Get multiple samples
			for (let i = 0; i < 50; i++) {
				const sample = getRandomSample(array, 3);
				samples.add(JSON.stringify(sample.sort()));
			}

			// Should produce different combinations
			expect(samples.size).toBeGreaterThan(5);
		});

		it('should handle empty arrays', () => {
			const empty: number[] = [];
			const sample = getRandomSample(empty, 3);

			expect(sample).toEqual([]);
		});
	});
});
