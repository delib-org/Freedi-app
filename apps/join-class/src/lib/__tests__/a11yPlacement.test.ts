import { describe, expect, it } from 'vitest';
import { firstClearTop } from '../a11yPlacement';

describe('firstClearTop', () => {
	it('stays where it is when nothing is under it', () => {
		expect(firstClearTop(200, 48, 0, 600, () => false)).toBe(200);
	});

	it('moves down to the first free spot', () => {
		const busy = (top: number): boolean => top < 300;

		expect(firstClearTop(200, 48, 0, 600, busy)).toBe(344);
	});

	it('goes up when the lower part of the edge is taken', () => {
		const busy = (top: number): boolean => top >= 200;

		expect(firstClearTop(200, 48, 0, 600, busy)).toBe(152);
	});

	it('gives up (null) when the whole edge is taken', () => {
		expect(firstClearTop(200, 48, 0, 600, () => true)).toBeNull();
	});
});
