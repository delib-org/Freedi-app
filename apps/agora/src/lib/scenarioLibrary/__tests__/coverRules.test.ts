import { describe, expect, it } from 'vitest';
import { COVER_MAX_BYTES, coverProblem, fitWithin } from '../coverRules';

describe('coverProblem', () => {
	it('accepts jpeg, png and webp within 5 MB', () => {
		expect(coverProblem({ type: 'image/png', size: 1000 })).toBeNull();
		expect(coverProblem({ type: 'image/webp', size: COVER_MAX_BYTES })).toBeNull();
	});

	it('refuses other types and oversize files', () => {
		expect(coverProblem({ type: 'image/gif', size: 1000 })).toBe('type');
		expect(coverProblem({ type: 'application/pdf', size: 1000 })).toBe('type');
		expect(coverProblem({ type: 'image/jpeg', size: COVER_MAX_BYTES + 1 })).toBe('size');
	});
});

describe('fitWithin', () => {
	it('never enlarges', () => {
		expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
	});

	it('shrinks the long side to the limit and keeps the ratio', () => {
		expect(fitWithin(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 });
		expect(fitWithin(1000, 4000, 1600)).toEqual({ width: 400, height: 1600 });
	});
});
