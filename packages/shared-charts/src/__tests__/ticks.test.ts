import { niceStep, niceTicks, thinLabels } from '../ticks';

describe('niceTicks', () => {
	it('produces four nice intervals from zero', () => {
		expect(niceTicks(0, 20)).toEqual([0, 5, 10, 15, 20]);
		expect(niceTicks(0, 100)).toEqual([0, 25, 50, 75, 100]);
	});

	it('rounds the top up so the max never touches the frame', () => {
		expect(niceTicks(0, 7)).toEqual([0, 2, 4, 6, 8]);
		expect(niceTicks(0, 13)).toEqual([0, 5, 10, 15]);
	});

	it('handles an all-zero domain', () => {
		expect(niceTicks(0, 0)).toEqual([0, 0.25, 0.5, 0.75, 1]);
	});

	it('can start above zero and swaps a reversed pair', () => {
		expect(niceTicks(40, 60)).toEqual([40, 45, 50, 55, 60]);
		expect(niceTicks(60, 40)).toEqual([40, 45, 50, 55, 60]);
	});

	it('honours the requested count', () => {
		expect(niceTicks(0, 100, 2)).toEqual([0, 50, 100]);
	});
});

describe('niceStep', () => {
	it('snaps to 1 / 2 / 2.5 / 5 / 10 × 10^n', () => {
		expect(niceStep(1)).toBe(1);
		expect(niceStep(1.5)).toBe(2);
		expect(niceStep(2.2)).toBe(2.5);
		expect(niceStep(4)).toBe(5);
		expect(niceStep(7)).toBe(10);
		expect(niceStep(0.3)).toBe(0.5);
		expect(niceStep(0)).toBe(1);
	});
});

describe('thinLabels', () => {
	const keys = (n: number): string[] => Array.from({ length: n }, (_, i) => `k${i}`);

	it('keeps everything when it fits', () => {
		expect(thinLabels(keys(4), 6)).toEqual([0, 1, 2, 3]);
	});

	it('keeps the first and last key and samples evenly', () => {
		expect(thinLabels(keys(10), 6)).toEqual([0, 2, 4, 6, 8, 9]);
		expect(thinLabels(keys(30), 6)).toEqual([0, 6, 12, 18, 24, 29]);
	});

	it('drops a neighbour that would crowd the last label', () => {
		expect(thinLabels(keys(8), 4)).toEqual([0, 3, 7]);
	});

	it('returns nothing for max 0 and only the first for max 1', () => {
		expect(thinLabels(keys(5), 0)).toEqual([]);
		expect(thinLabels(keys(5), 1)).toEqual([0]);
		expect(thinLabels([], 6)).toEqual([]);
	});
});
