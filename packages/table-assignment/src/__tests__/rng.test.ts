import { createRng, shuffle } from '../rng';

describe('createRng', () => {
	it('is deterministic for a seed and different across seeds', () => {
		const a = createRng(7);
		const b = createRng(7);
		const c = createRng(8);
		const first = [a.next(), a.next(), a.next()];
		expect([b.next(), b.next(), b.next()]).toEqual(first);
		expect([c.next(), c.next(), c.next()]).not.toEqual(first);
	});

	it('stays in range', () => {
		const rng = createRng(1);
		for (let i = 0; i < 1000; i++) {
			const value = rng.next();
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(1);
			expect(rng.int(5)).toBeLessThan(5);
		}
	});
});

describe('shuffle', () => {
	it('keeps every item and is reproducible', () => {
		const items = [1, 2, 3, 4, 5, 6, 7, 8];
		const once = shuffle([...items], createRng(3));
		const again = shuffle([...items], createRng(3));
		expect([...once].sort()).toEqual(items);
		expect(again).toEqual(once);
	});
});
