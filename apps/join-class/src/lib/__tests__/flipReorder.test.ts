import { describe, expect, it } from 'vitest';
import { parseCssTime, recordPositions } from '../flipReorder';

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
