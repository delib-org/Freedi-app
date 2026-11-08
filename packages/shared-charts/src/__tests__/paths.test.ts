import { areaPath, linePath, roundedRectPath, roundedTopRectPath } from '../paths';

describe('paths', () => {
	it('draws a polyline', () => {
		expect(linePath([{ x: 0, y: 1 }, { x: 10, y: 2.5 }])).toBe('M0 1 L10 2.5');
		expect(linePath([])).toBe('');
	});

	it('closes an area down to the baseline', () => {
		expect(areaPath([{ x: 0, y: 1 }, { x: 10, y: 2 }], 50)).toBe('M0 1 L10 2 L10 50 L0 50 Z');
		expect(areaPath([], 50)).toBe('');
	});

	it('draws a plain rectangle when no corner is rounded', () => {
		const d = roundedRectPath(0, 0, 10, 20, 4, { tl: false, tr: false, br: false, bl: false });
		expect(d).not.toContain('A');
		expect(d).toBe('M0 0 L10 0 L10 20 L0 20 L0 0 Z');
	});

	it('rounds only the top corners for a bar', () => {
		const d = roundedTopRectPath(0, 0, 10, 20, 4);
		expect(d.split('A').length - 1).toBe(2);
		expect(d).toContain('L10 20');
		expect(d).toContain('L0 20');
	});

	it('clamps the radius to half the smaller side', () => {
		const d = roundedTopRectPath(0, 0, 4, 20, 10);
		expect(d).toContain('A2 2');
	});
});
