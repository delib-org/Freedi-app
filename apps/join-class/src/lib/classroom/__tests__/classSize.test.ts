import { describe, it, expect } from 'vitest';
import type { Statement } from '@freedi/shared-types';
import { DEFAULT_CLASS_SIZE, classSizePatch, parseClassSize, storedClassSize } from '../classSize';

describe('parseClassSize', () => {
	it('is 40 by default, from one named constant', () => {
		expect(DEFAULT_CLASS_SIZE).toBe(40);
	});

	it('keeps a positive whole number, typed or as a string', () => {
		expect(parseClassSize('28')).toBe(28);
		expect(parseClassSize(31)).toBe(31);
		expect(parseClassSize(' 12 ')).toBe(12);
		expect(parseClassSize('7.9')).toBe(7);
	});

	it('empty, 0, negative or not a number all mean 40', () => {
		for (const raw of ['', '0', 0, '-3', -3, 'abc', NaN, null, undefined, Infinity]) {
			expect(parseClassSize(raw)).toBe(DEFAULT_CLASS_SIZE);
		}
	});
});

describe('storedClassSize', () => {
	const withN = (n: unknown): Statement =>
		({ evaluationSettings: { targetPopulation: n } }) as unknown as Statement;

	it('reads the lesson number, and is undefined for a lesson that never had one', () => {
		expect(storedClassSize(withN(28))).toBe(28);
		expect(storedClassSize({} as Statement)).toBeUndefined();
		expect(storedClassSize(null)).toBeUndefined();
		expect(storedClassSize(withN(0))).toBeUndefined();
	});
});

describe('classSizePatch', () => {
	it('never writes 0 or null', () => {
		expect(classSizePatch(0)).toEqual({ evaluationSettings: { targetPopulation: 40 } });
		expect(classSizePatch(25)).toEqual({ evaluationSettings: { targetPopulation: 25 } });
	});
});
