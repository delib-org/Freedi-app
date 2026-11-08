import { binValues, median } from '../histogram';

describe('binValues', () => {
	it('splits values into equal-width bins with a closed last bin', () => {
		const { bins, min, max } = binValues([1, 2, 3, 4, 5, 6], 3);
		expect(min).toBe(1);
		expect(max).toBe(6);
		expect(bins.map((b) => b.count)).toEqual([2, 2, 2]);
		expect(bins[2].end).toBe(6);
	});

	it('defaults to six bins', () => {
		expect(binValues([0, 60]).bins).toHaveLength(6);
	});

	it('gives identical values a unit-wide bin', () => {
		const { bins } = binValues([5, 5, 5], 2);
		expect(bins[0].count + bins[1].count).toBe(3);
		expect(bins[1].end).toBe(6);
	});

	it('returns nothing for empty or non-finite input', () => {
		expect(binValues([]).bins).toEqual([]);
		expect(binValues([Number.NaN]).bins).toEqual([]);
		expect(binValues([1, 2], 0).bins).toEqual([]);
	});
});

describe('median', () => {
	it('handles odd, even and empty', () => {
		expect(median([3, 1, 2])).toBe(2);
		expect(median([4, 1, 3, 2])).toBe(2.5);
		expect(median([])).toBeNull();
	});
});
