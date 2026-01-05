/**
 * Tests for Mean Absolute Deviation (MAD) calculation utilities
 * Used for polarization index and demographic divergence analysis
 */

import {
	calcMadAndMean,
	calculateDCI,
	meetsKAnonymity,
	interpretDivergence,
	interpretDCI,
	DEMOGRAPHIC_CONSTANTS,
	MadResult,
} from '../utils/madCalculation';

describe('madCalculation', () => {
	describe('calcMadAndMean', () => {
		it('should return zeros for empty array', () => {
			const result = calcMadAndMean([]);
			expect(result).toEqual({ mad: 0, mean: 0, n: 0 });
		});

		it('should return zero MAD for single value', () => {
			const result = calcMadAndMean([5]);
			expect(result).toEqual({ mad: 0, mean: 5, n: 1 });
		});

		it('should return zero MAD for single negative value', () => {
			const result = calcMadAndMean([-0.5]);
			expect(result).toEqual({ mad: 0, mean: -0.5, n: 1 });
		});

		it('should calculate correctly for identical values', () => {
			const result = calcMadAndMean([3, 3, 3, 3]);
			expect(result.mad).toBe(0);
			expect(result.mean).toBe(3);
			expect(result.n).toBe(4);
		});

		it('should calculate correct MAD for simple values', () => {
			// Values: [1, 2, 3, 4, 5]
			// Mean: 3
			// Deviations: [2, 1, 0, 1, 2]
			// MAD: 6/5 = 1.2
			const result = calcMadAndMean([1, 2, 3, 4, 5]);
			expect(result.mean).toBe(3);
			expect(result.mad).toBe(1.2);
			expect(result.n).toBe(5);
		});

		it('should calculate correctly for evaluation range (-1 to +1)', () => {
			// Values: [-1, -0.5, 0, 0.5, 1]
			// Mean: 0
			// Deviations: [1, 0.5, 0, 0.5, 1]
			// MAD: 3/5 = 0.6
			const result = calcMadAndMean([-1, -0.5, 0, 0.5, 1]);
			expect(result.mean).toBe(0);
			expect(result.mad).toBe(0.6);
		});

		it('should calculate maximum polarization for extreme values', () => {
			// Half at -1, half at +1
			// Mean: 0
			// MAD: 1 (maximum polarization)
			const result = calcMadAndMean([-1, -1, 1, 1]);
			expect(result.mean).toBe(0);
			expect(result.mad).toBe(1);
		});

		it('should handle all zeros', () => {
			const result = calcMadAndMean([0, 0, 0, 0]);
			expect(result).toEqual({ mad: 0, mean: 0, n: 4 });
		});

		it('should handle negative values correctly', () => {
			const result = calcMadAndMean([-2, -4, -6]);
			expect(result.mean).toBe(-4);
			expect(result.mad).toBeCloseTo(4 / 3);
			expect(result.n).toBe(3);
		});

		it('should handle floating point values', () => {
			const result = calcMadAndMean([0.1, 0.2, 0.3]);
			expect(result.mean).toBeCloseTo(0.2);
			expect(result.mad).toBeCloseTo(0.2 / 3);
		});
	});

	describe('calculateDCI', () => {
		it('should return 1 for identical means (perfect agreement)', () => {
			expect(calculateDCI(0.5, 0.5)).toBe(1);
			expect(calculateDCI(-0.5, -0.5)).toBe(1);
			expect(calculateDCI(0, 0)).toBe(1);
		});

		it('should return 0 for maximum disagreement', () => {
			// Maximum disagreement: one at -1, one at +1
			// DCI = 1 - (2/2) = 0
			expect(calculateDCI(-1, 1)).toBe(0);
			expect(calculateDCI(1, -1)).toBe(0);
		});

		it('should return 0.5 for half disagreement', () => {
			// DCI = 1 - (1/2) = 0.5
			expect(calculateDCI(0, 1)).toBe(0.5);
			expect(calculateDCI(-1, 0)).toBe(0.5);
		});

		it('should handle symmetric values', () => {
			expect(calculateDCI(0.2, 0.8)).toBe(calculateDCI(0.8, 0.2));
		});

		it('should return values in 0-1 range for valid inputs', () => {
			const testCases = [
				[-1, -1],
				[-1, 0],
				[-1, 1],
				[0, 0],
				[0, 1],
				[1, 1],
				[-0.5, 0.5],
			];

			testCases.forEach(([a, b]) => {
				const dci = calculateDCI(a, b);
				expect(dci).toBeGreaterThanOrEqual(0);
				expect(dci).toBeLessThanOrEqual(1);
			});
		});

		it('should calculate correctly for typical values', () => {
			// meanA = 0.3, meanB = 0.7
			// DCI = 1 - (0.4 / 2) = 1 - 0.2 = 0.8
			expect(calculateDCI(0.3, 0.7)).toBe(0.8);
		});
	});

	describe('meetsKAnonymity', () => {
		it('should return false for segment size below threshold', () => {
			expect(meetsKAnonymity(0)).toBe(false);
			expect(meetsKAnonymity(1)).toBe(false);
			expect(meetsKAnonymity(4)).toBe(false);
		});

		it('should return true for segment size at threshold', () => {
			expect(meetsKAnonymity(DEMOGRAPHIC_CONSTANTS.MIN_SEGMENT_SIZE)).toBe(
				true
			);
			expect(meetsKAnonymity(5)).toBe(true);
		});

		it('should return true for segment size above threshold', () => {
			expect(meetsKAnonymity(6)).toBe(true);
			expect(meetsKAnonymity(100)).toBe(true);
			expect(meetsKAnonymity(1000)).toBe(true);
		});
	});

	describe('interpretDivergence', () => {
		it('should return "low" for values <= 0.2', () => {
			expect(interpretDivergence(0)).toBe('low');
			expect(interpretDivergence(0.1)).toBe('low');
			expect(interpretDivergence(0.2)).toBe('low');
		});

		it('should return "medium-low" for values > 0.2 and <= 0.4', () => {
			expect(interpretDivergence(0.21)).toBe('medium-low');
			expect(interpretDivergence(0.3)).toBe('medium-low');
			expect(interpretDivergence(0.4)).toBe('medium-low');
		});

		it('should return "medium-high" for values > 0.4 and <= 0.6', () => {
			expect(interpretDivergence(0.41)).toBe('medium-high');
			expect(interpretDivergence(0.5)).toBe('medium-high');
			expect(interpretDivergence(0.6)).toBe('medium-high');
		});

		it('should return "high" for values > 0.6', () => {
			expect(interpretDivergence(0.61)).toBe('high');
			expect(interpretDivergence(0.8)).toBe('high');
			expect(interpretDivergence(1)).toBe('high');
		});

		it('should handle boundary values correctly', () => {
			// At boundary: should be the lower category
			expect(interpretDivergence(0.2)).toBe('low');
			expect(interpretDivergence(0.4)).toBe('medium-low');
			expect(interpretDivergence(0.6)).toBe('medium-high');
		});
	});

	describe('interpretDCI', () => {
		it('should return "strong-agreement" for DCI >= 0.8', () => {
			expect(interpretDCI(0.8)).toBe('strong-agreement');
			expect(interpretDCI(0.9)).toBe('strong-agreement');
			expect(interpretDCI(1)).toBe('strong-agreement');
		});

		it('should return "good-agreement" for DCI >= 0.6 and < 0.8', () => {
			expect(interpretDCI(0.6)).toBe('good-agreement');
			expect(interpretDCI(0.7)).toBe('good-agreement');
			expect(interpretDCI(0.79)).toBe('good-agreement');
		});

		it('should return "moderate" for DCI >= 0.4 and < 0.6', () => {
			expect(interpretDCI(0.4)).toBe('moderate');
			expect(interpretDCI(0.5)).toBe('moderate');
			expect(interpretDCI(0.59)).toBe('moderate');
		});

		it('should return "weak-agreement" for DCI >= 0.2 and < 0.4', () => {
			expect(interpretDCI(0.2)).toBe('weak-agreement');
			expect(interpretDCI(0.3)).toBe('weak-agreement');
			expect(interpretDCI(0.39)).toBe('weak-agreement');
		});

		it('should return "opposing" for DCI < 0.2', () => {
			expect(interpretDCI(0)).toBe('opposing');
			expect(interpretDCI(0.1)).toBe('opposing');
			expect(interpretDCI(0.19)).toBe('opposing');
		});
	});

	describe('DEMOGRAPHIC_CONSTANTS', () => {
		it('should have correct MIN_SEGMENT_SIZE', () => {
			expect(DEMOGRAPHIC_CONSTANTS.MIN_SEGMENT_SIZE).toBe(5);
		});

		it('should have correct DIVERGENCE thresholds', () => {
			expect(DEMOGRAPHIC_CONSTANTS.DIVERGENCE.LOW).toBe(0.2);
			expect(DEMOGRAPHIC_CONSTANTS.DIVERGENCE.MEDIUM_LOW).toBe(0.4);
			expect(DEMOGRAPHIC_CONSTANTS.DIVERGENCE.MEDIUM_HIGH).toBe(0.6);
			expect(DEMOGRAPHIC_CONSTANTS.DIVERGENCE.HIGH).toBe(0.8);
		});

		it('should have correct DCI thresholds', () => {
			expect(DEMOGRAPHIC_CONSTANTS.DCI.STRONG_AGREEMENT).toBe(0.8);
			expect(DEMOGRAPHIC_CONSTANTS.DCI.GOOD_AGREEMENT).toBe(0.6);
			expect(DEMOGRAPHIC_CONSTANTS.DCI.MODERATE).toBe(0.4);
			expect(DEMOGRAPHIC_CONSTANTS.DCI.WEAK_AGREEMENT).toBe(0.2);
		});
	});
});
