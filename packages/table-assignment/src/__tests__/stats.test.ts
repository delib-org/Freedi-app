import { sideStats, tableDeviation } from '../stats';
import type { Participant } from '../types';

function withSide(...values: number[][]): Participant[] {
	return values.map((side, i) => ({ id: `p${i}`, side, preferences: [] }));
}

describe('sideStats', () => {
	it('skips undeclared participants', () => {
		const stats = sideStats([...withSide([10], [30]), { id: 'x', preferences: [] }]);
		expect(stats).toEqual({ n: 2, mean: [20], sd: [10] });
	});

	it('handles several axes', () => {
		const stats = sideStats(withSide([0, 100], [100, 0]));
		expect(stats.mean).toEqual([50, 50]);
		expect(stats.sd).toEqual([50, 50]);
	});

	it('is empty for no declared sides', () => {
		expect(sideStats([{ id: 'x', preferences: [] }])).toEqual({ n: 0, mean: [], sd: [] });
	});
});

describe('tableDeviation', () => {
	const population = sideStats(withSide([0], [20], [40], [60], [80], [100]));

	it('is 0 for a table that mirrors the crowd', () => {
		expect(tableDeviation(population, population)).toBe(0);
	});

	it('grows with a shifted mean and a narrower spread', () => {
		const oneSided = sideStats(withSide([0], [20]));
		const meanShift = Math.abs(10 - population.mean[0]) / population.sd[0];
		const spreadShift = Math.abs(10 - population.sd[0]) / population.sd[0];
		expect(tableDeviation(oneSided, population)).toBeCloseTo(meanShift + spreadShift);
	});

	it('counts only the mean for a single declared member', () => {
		const alone = sideStats(withSide([0]));
		expect(tableDeviation(alone, population)).toBeCloseTo(population.mean[0] / population.sd[0]);
	});

	it('is 0 when nobody at the table declared a side, or the crowd all agree', () => {
		expect(tableDeviation(sideStats([]), population)).toBe(0);
		const unanimous = sideStats(withSide([50], [50]));
		expect(tableDeviation(sideStats(withSide([50])), unanimous)).toBe(0);
	});
});
