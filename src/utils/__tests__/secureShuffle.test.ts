import { cryptoRandomInt, secureShuffle } from '../secureShuffle';

describe('secureShuffle', () => {
	it('returns a permutation and leaves the input untouched', () => {
		const input = Array.from({ length: 40 }, (_, i) => i);

		const output = secureShuffle(input);

		expect(input).toEqual(Array.from({ length: 40 }, (_, i) => i));
		expect([...output].sort((a, b) => a - b)).toEqual(input);
	});

	it('is Fisher–Yates: draws j in [0, i] for i from n-1 down to 1', () => {
		const draws: number[] = [];
		const output = secureShuffle(['a', 'b', 'c', 'd'], (max) => {
			draws.push(max);

			return 0;
		});

		expect(draws).toEqual([4, 3, 2]);
		expect(output).toEqual(['b', 'c', 'd', 'a']);
	});

	it('breaks per-person runs of id-ordered rows', () => {
		const rows = [1, -1, 0.5].flatMap((value) => Array.from({ length: 10 }, () => value));
		const shuffled = secureShuffle(rows);
		const runs = shuffled.reduce((n, v, i) => (i === 0 || v !== shuffled[i - 1] ? n + 1 : n), 0);

		expect(runs).toBeGreaterThan(8);
	});
});

describe('cryptoRandomInt', () => {
	it('stays in [0, max)', () => {
		for (let i = 0; i < 200; i++) {
			const value = cryptoRandomInt(7);
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(7);
		}
	});
});
