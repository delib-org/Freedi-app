import { describe, it, expect } from 'vitest';
import { formatPoints } from '../../components/PointsPill';

/**
 * Balances move in quarter steps (the rating credit is +0.5, and older
 * sessions carry −0.25 deductions), so every surface that shows a total has
 * to render quarters exactly. Flooring or rounding here makes students
 * "lose" points they can see themselves earning.
 */
describe('formatPoints', () => {
	it('renders whole numbers without a decimal tail', () => {
		expect(formatPoints(0)).toBe('0');
		expect(formatPoints(3)).toBe('3');
		expect(formatPoints(15)).toBe('15');
	});

	it('renders quarter balances exactly, never floored', () => {
		expect(formatPoints(2.75)).toBe('2.75');
		expect(formatPoints(0.25)).toBe('0.25');
	});

	it('drops a trailing zero on half points', () => {
		expect(formatPoints(2.5)).toBe('2.5');
		expect(formatPoints(0.5)).toBe('0.5');
	});

	it('survives floating-point drift from repeated quarter arithmetic', () => {
		// 0.1+0.2-style drift is real here: eleven +0.25 credits do not sum
		// to a clean 2.75 in binary floating point
		let total = 0;
		for (let i = 0; i < 11; i++) total += 0.25;
		expect(formatPoints(total)).toBe('2.75');
	});
});
