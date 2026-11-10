import { formatScore, formatScoreThreshold, toDisplayScore } from '../scoreFormat';

describe('scoreFormat', () => {
	describe('formatScore', () => {
		it.each([
			[0.62, '+62'],
			[1, '+100'],
			[0.01, '+1'],
			[-0.15, '−15'],
			[-1, '−100'],
			[0, '0'],
		])('%d shows as %s', (score, expected) => {
			expect(formatScore(score)).toBe(expected);
		});

		it('never carries a percent sign', () => {
			[-1, -0.5, 0, 0.42, 1].forEach((score) => {
				expect(formatScore(score)).not.toContain('%');
			});
		});

		it('shows negative zero and values that round to zero as a plain 0', () => {
			expect(formatScore(-0)).toBe('0');
			expect(formatScore(-0.004)).toBe('0');
			expect(formatScore(0.004)).toBe('0');
		});

		it('rounds to a whole number, the same way on both sides of zero', () => {
			expect(formatScore(0.625)).toBe('+63');
			expect(formatScore(-0.625)).toBe('−63');
		});

		it('stays within the scale', () => {
			expect(formatScore(1.4)).toBe('+100');
			expect(formatScore(-1.4)).toBe('−100');
		});

		it('shows 0 for a value that is not a number', () => {
			expect(formatScore(Number.NaN)).toBe('0');
			expect(formatScore(Number.POSITIVE_INFINITY)).toBe('0');
		});
	});

	describe('toDisplayScore', () => {
		it('never returns negative zero', () => {
			expect(Object.is(toDisplayScore(-0.001), 0)).toBe(true);
		});

		it('keeps the sign', () => {
			expect(toDisplayScore(-0.095)).toBe(-10);
			expect(toDisplayScore(0.595)).toBe(60);
		});
	});

	describe('formatScoreThreshold', () => {
		it('uses the score scale with no plus sign', () => {
			expect(formatScoreThreshold(0.6)).toBe('60');
			expect(formatScoreThreshold(0)).toBe('0');
			expect(formatScoreThreshold(-0.1)).toBe('−10');
		});
	});
});
