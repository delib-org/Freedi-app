import { describe, expect, it } from 'vitest';
import { sideCount } from '../sideCount';

describe('sideCount', () => {
	it('counts students who chose a side, centre included', () => {
		const students = [{ camp: 'a' as const }, { camp: 'center' as const }, { camp: null }];
		expect(sideCount(students)).toEqual({ chose: 2, total: 3 });
	});

	it('is 0 of 0 for an empty class', () => {
		expect(sideCount([])).toEqual({ chose: 0, total: 0 });
	});
});
