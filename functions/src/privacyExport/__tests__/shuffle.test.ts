import { secureShuffle } from '../shuffle';

describe('secureShuffle', () => {
	it('returns a permutation and leaves the input untouched', () => {
		const input = Array.from({ length: 50 }, (_, i) => i);

		const output = secureShuffle(input);

		expect(input).toEqual(Array.from({ length: 50 }, (_, i) => i));
		expect([...output].sort((a, b) => a - b)).toEqual(input);
	});

	it('is Fisher–Yates: draws j in [0, i] for i from n-1 down to 1', () => {
		const draws: number[] = [];
		const alwaysZero = (max: number) => {
			draws.push(max);

			return 0;
		};

		const output = secureShuffle(['a', 'b', 'c', 'd'], alwaysZero);

		expect(draws).toEqual([4, 3, 2]);
		// Swaps (3,0), (2,0), (1,0) on [a,b,c,d].
		expect(output).toEqual(['b', 'c', 'd', 'a']);
	});

	it('is the identity when every draw picks i itself', () => {
		const output = secureShuffle([1, 2, 3], (max) => max - 1);

		expect(output).toEqual([1, 2, 3]);
	});

	it('handles empty and single-item lists', () => {
		expect(secureShuffle([])).toEqual([]);
		expect(secureShuffle(['x'])).toEqual(['x']);
	});
});
