import { bandScale, linearScale } from '../scales';

describe('linearScale', () => {
	it('maps the domain onto the range linearly', () => {
		const s = linearScale([0, 20], [160, 10]);
		expect(s(0)).toBe(160);
		expect(s(20)).toBe(10);
		expect(s(10)).toBe(85);
	});

	it('pins a degenerate domain to the range start', () => {
		const s = linearScale([5, 5], [0, 100]);
		expect(s(5)).toBe(0);
		expect(s(99)).toBe(0);
	});
});

describe('bandScale', () => {
	it('splits the range into equal bands with a gap between them', () => {
		const b = bandScale(2, [0, 100], 2);
		expect(b.bandWidth).toBe(49);
		expect(b.step).toBe(51);
		expect(b.start(0)).toBe(0);
		expect(b.start(1)).toBe(51);
		expect(b.center(0)).toBe(24.5);
		expect(b.start(1) + b.bandWidth).toBe(100);
	});

	it('handles zero bands', () => {
		const b = bandScale(0, [10, 20], 2);
		expect(b.bandWidth).toBe(0);
		expect(b.start(3)).toBe(10);
		expect(b.center(3)).toBe(10);
	});

	it('never goes negative when the gap exceeds the range', () => {
		expect(bandScale(10, [0, 5], 2).bandWidth).toBe(0);
	});
});
