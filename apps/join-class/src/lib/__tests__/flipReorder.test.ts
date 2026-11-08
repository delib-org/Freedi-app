import { describe, expect, it } from 'vitest';
import { orderChanged, parseCssTime, recordPositions } from '../flipReorder';

describe('orderChanged', () => {
	it('is false for the same keys in the same order', () => {
		expect(orderChanged(['a', 'b'], ['a', 'b'])).toBe(false);
		expect(orderChanged([], [])).toBe(false);
	});

	it('is true when two keys swap (a rating moved a card)', () => {
		expect(orderChanged(['a', 'b', 'c'], ['b', 'a', 'c'])).toBe(true);
	});

	it('is true when a key arrives or leaves', () => {
		expect(orderChanged(['a'], ['a', 'b'])).toBe(true);
		expect(orderChanged(['a', 'b'], ['b'])).toBe(true);
	});
});

describe('parseCssTime', () => {
	it('reads milliseconds and seconds', () => {
		expect(parseCssTime('560ms')).toBe(560);
		expect(parseCssTime(' 0.5s ')).toBe(500);
		expect(parseCssTime('0ms')).toBe(0);
	});

	it('returns null for anything else', () => {
		expect(parseCssTime('')).toBeNull();
		expect(parseCssTime('fast')).toBeNull();
		expect(parseCssTime('300')).toBeNull();
	});
});

describe('recordPositions', () => {
	it('records nothing without a container', () => {
		expect(recordPositions(null).size).toBe(0);
		expect(recordPositions(undefined).size).toBe(0);
	});
});
