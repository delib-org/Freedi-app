import {
	meetsRemovalThreshold,
	meetsAdditionThreshold,
	DEFAULT_REMOVAL_THRESHOLD,
	DEFAULT_ADDITION_THRESHOLD,
	DEFAULT_MIN_EVALUATORS,
} from '../utils/consensusCalculation';

describe('consensusCalculation - threshold helpers', () => {
	describe('meetsRemovalThreshold', () => {
		it('should return true when consensus is at or below threshold with enough evaluators', () => {
			expect(meetsRemovalThreshold(-0.5, 3)).toBe(true);
			expect(meetsRemovalThreshold(-0.4, 3)).toBe(true);
		});

		it('should return false when consensus is above threshold', () => {
			expect(meetsRemovalThreshold(-0.3, 5)).toBe(false);
			expect(meetsRemovalThreshold(0, 10)).toBe(false);
			expect(meetsRemovalThreshold(0.5, 10)).toBe(false);
		});

		it('should return false when not enough evaluators', () => {
			expect(meetsRemovalThreshold(-0.5, 2)).toBe(false);
			expect(meetsRemovalThreshold(-0.5, 1)).toBe(false);
			expect(meetsRemovalThreshold(-0.5, 0)).toBe(false);
		});

		it('should use default threshold and minEvaluators', () => {
			expect(DEFAULT_REMOVAL_THRESHOLD).toBe(-0.4);
			expect(DEFAULT_MIN_EVALUATORS).toBe(3);

			// Exactly at threshold with exactly enough evaluators
			expect(meetsRemovalThreshold(-0.4, 3)).toBe(true);
		});

		it('should respect custom threshold', () => {
			// Custom removal threshold at -0.2: consensus <= -0.2 triggers removal
			expect(meetsRemovalThreshold(-0.1, 5, -0.2)).toBe(false); // -0.1 > -0.2, not removed
			expect(meetsRemovalThreshold(-0.2, 5, -0.2)).toBe(true);  // exactly at threshold
			expect(meetsRemovalThreshold(-0.3, 5, -0.2)).toBe(true);  // -0.3 < -0.2, removed
			expect(meetsRemovalThreshold(-0.5, 5, -0.2)).toBe(true);
		});

		it('should respect custom minEvaluators', () => {
			expect(meetsRemovalThreshold(-0.5, 4, -0.4, 5)).toBe(false);
			expect(meetsRemovalThreshold(-0.5, 5, -0.4, 5)).toBe(true);
		});

		it('should handle edge case of -1 consensus', () => {
			expect(meetsRemovalThreshold(-1, 3)).toBe(true);
		});
	});

	describe('meetsAdditionThreshold', () => {
		it('should return true when consensus is at or above threshold with enough evaluators', () => {
			expect(meetsAdditionThreshold(0.5, 3)).toBe(true);
			expect(meetsAdditionThreshold(0.4, 3)).toBe(true);
		});

		it('should return false when consensus is below threshold', () => {
			expect(meetsAdditionThreshold(0.3, 5)).toBe(false);
			expect(meetsAdditionThreshold(0, 10)).toBe(false);
			expect(meetsAdditionThreshold(-0.5, 10)).toBe(false);
		});

		it('should return false when not enough evaluators', () => {
			expect(meetsAdditionThreshold(0.5, 2)).toBe(false);
			expect(meetsAdditionThreshold(0.5, 1)).toBe(false);
			expect(meetsAdditionThreshold(0.5, 0)).toBe(false);
		});

		it('should use default threshold and minEvaluators', () => {
			expect(DEFAULT_ADDITION_THRESHOLD).toBe(0.4);

			// Exactly at threshold with exactly enough evaluators
			expect(meetsAdditionThreshold(0.4, 3)).toBe(true);
		});

		it('should respect custom threshold', () => {
			expect(meetsAdditionThreshold(0.5, 5, 0.6)).toBe(false);
			expect(meetsAdditionThreshold(0.6, 5, 0.6)).toBe(true);
			expect(meetsAdditionThreshold(0.9, 5, 0.6)).toBe(true);
		});

		it('should respect custom minEvaluators', () => {
			expect(meetsAdditionThreshold(0.5, 4, 0.4, 5)).toBe(false);
			expect(meetsAdditionThreshold(0.5, 5, 0.4, 5)).toBe(true);
		});

		it('should handle edge case of 1.0 consensus', () => {
			expect(meetsAdditionThreshold(1, 3)).toBe(true);
		});
	});

	describe('threshold interaction', () => {
		it('removal and addition thresholds should not overlap with defaults', () => {
			// A consensus score should never simultaneously meet both thresholds
			const testScores = [-1, -0.5, -0.4, -0.3, 0, 0.3, 0.4, 0.5, 1];

			for (const score of testScores) {
				const meetsRemoval = meetsRemovalThreshold(score, 10);
				const meetsAddition = meetsAdditionThreshold(score, 10);

				// They should never both be true
				expect(meetsRemoval && meetsAddition).toBe(false);
			}
		});
	});
});
