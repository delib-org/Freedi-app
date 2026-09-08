import { describe, expect, it } from 'vitest';
import { AGORA_ROUND } from '@freedi/shared-types';
import { stepAfterKey } from '../UnitScale';

const COUNT = AGORA_ROUND.UNIT_STEPS.length;

describe('UnitScale keyboard', () => {
	it('is a five-step group, which is what the arrow maths wraps around', () => {
		expect(COUNT).toBe(5);
	});

	describe('left to right', () => {
		it('ArrowRight walks forward, ArrowLeft back', () => {
			expect(stepAfterKey('ArrowRight', 1, COUNT, false)).toBe(2);
			expect(stepAfterKey('ArrowLeft', 1, COUNT, false)).toBe(0);
		});

		it('wraps at both ends, the way a radiogroup does', () => {
			expect(stepAfterKey('ArrowRight', 4, COUNT, false)).toBe(0);
			expect(stepAfterKey('ArrowLeft', 0, COUNT, false)).toBe(4);
		});
	});

	describe('right to left', () => {
		it('the step to the RIGHT of me in Hebrew is the previous one', () => {
			expect(stepAfterKey('ArrowRight', 1, COUNT, true)).toBe(0);
			expect(stepAfterKey('ArrowLeft', 1, COUNT, true)).toBe(2);
		});

		it('wraps the same way, mirrored', () => {
			expect(stepAfterKey('ArrowRight', 0, COUNT, true)).toBe(4);
			expect(stepAfterKey('ArrowLeft', 4, COUNT, true)).toBe(0);
		});
	});

	it('up and down are direction-neutral in both writing directions', () => {
		for (const rtl of [true, false]) {
			expect(stepAfterKey('ArrowUp', 2, COUNT, rtl)).toBe(1);
			expect(stepAfterKey('ArrowDown', 2, COUNT, rtl)).toBe(3);
		}
	});

	it('Home and End jump to the ends by INDEX, not by side', () => {
		for (const rtl of [true, false]) {
			expect(stepAfterKey('Home', 3, COUNT, rtl)).toBe(0);
			expect(stepAfterKey('End', 1, COUNT, rtl)).toBe(COUNT - 1);
		}
	});

	it('leaves every other key alone, so Tab and Enter still do their jobs', () => {
		for (const key of ['Tab', 'Enter', ' ', 'a', 'Escape', 'PageUp']) {
			expect(stepAfterKey(key, 2, COUNT, false)).toBeNull();
		}
	});
});
