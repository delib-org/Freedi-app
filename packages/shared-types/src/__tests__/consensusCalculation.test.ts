import {
	meetsRemovalThreshold,
	meetsAdditionThreshold,
	DEFAULT_REMOVAL_THRESHOLD,
	DEFAULT_ADDITION_THRESHOLD,
	DEFAULT_MIN_EVALUATORS,
	calcAgreementIndex,
	calcConfidenceIndex,
	DEFAULT_SAMPLING_QUALITY,
	CONFIDENCE_CALIBRATION_CONSTANT,
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

describe('calcAgreementIndex', () => {
	it('should return 1 when all evaluators give the same value', () => {
		// 3 evaluators all vote +1: sum=3, sumSq=3, n=3
		expect(calcAgreementIndex(3, 3, 3)).toBe(1);
		// 5 evaluators all vote +0.5: sum=2.5, sumSq=1.25, n=5
		expect(calcAgreementIndex(2.5, 1.25, 5)).toBe(1);
	});

	it('should return 0 for maximum polarization', () => {
		// Half +1, half -1: sum=0, sumSq=4, n=4 → mean=0, var=1, sigma=1, A=0
		expect(calcAgreementIndex(0, 4, 4)).toBe(0);
	});

	it('should return 0 when n <= 0', () => {
		expect(calcAgreementIndex(0, 0, 0)).toBe(0);
		expect(calcAgreementIndex(5, 5, -1)).toBe(0);
	});

	it('should return values between 0 and 1 for mixed evaluations', () => {
		// 3 evaluators: +1, +0.5, +0.5 → sum=2, sumSq=1.5, n=3
		const result = calcAgreementIndex(2, 1.5, 3);
		expect(result).toBeGreaterThan(0);
		expect(result).toBeLessThan(1);
	});

	it('should be independent of sample size (same distribution)', () => {
		// Same mean and variance, different n
		// All vote +0.5: sum=n*0.5, sumSq=n*0.25
		const a3 = calcAgreementIndex(1.5, 0.75, 3);
		const a100 = calcAgreementIndex(50, 25, 100);
		expect(a3).toBe(a100);
	});
});

describe('calcConfidenceIndex', () => {
	it('should return constants', () => {
		expect(DEFAULT_SAMPLING_QUALITY).toBe(0.3);
		expect(CONFIDENCE_CALIBRATION_CONSTANT).toBe(5);
	});

	it('should return 0 when n <= 0', () => {
		expect(calcConfidenceIndex(0, 1000, 1)).toBe(0);
		expect(calcConfidenceIndex(-1, 1000, 1)).toBe(0);
	});

	it('should return 1 when n >= N (complete census)', () => {
		expect(calcConfidenceIndex(100, 100, 1)).toBe(1);
		expect(calcConfidenceIndex(150, 100, 0.5)).toBe(1);
	});

	it('should return 1 when N <= 1', () => {
		expect(calcConfidenceIndex(1, 1, 1)).toBe(1);
		expect(calcConfidenceIndex(1, 0, 1)).toBe(1);
	});

	it('should match polling standards: n=1500, N=2M, q=1 ≈ 0.95', () => {
		const result = calcConfidenceIndex(1500, 2000000, 1);
		expect(result).toBeCloseTo(0.954, 2);
	});

	it('should return low confidence for small samples: n=9, N=200K, q=1 ≈ 0.13', () => {
		const result = calcConfidenceIndex(9, 200000, 1);
		expect(result).toBeCloseTo(0.13, 1);
	});

	it('should return high confidence for nearly complete samples: n=25, N=30, q=1 ≈ 0.90', () => {
		const result = calcConfidenceIndex(25, 30, 1);
		expect(result).toBeCloseTo(0.90, 1);
	});

	it('should decrease with lower sampling quality', () => {
		const highQ = calcConfidenceIndex(100, 10000, 1);
		const lowQ = calcConfidenceIndex(100, 10000, 0.3);
		expect(highQ).toBeGreaterThan(lowQ);
	});

	it('should increase monotonically with n', () => {
		const n10 = calcConfidenceIndex(10, 10000, 0.5);
		const n100 = calcConfidenceIndex(100, 10000, 0.5);
		const n1000 = calcConfidenceIndex(1000, 10000, 0.5);
		expect(n100).toBeGreaterThan(n10);
		expect(n1000).toBeGreaterThan(n100);
	});

	it('should always return values in [0, 1]', () => {
		const testCases = [
			[1, 1000000, 0.1],
			[500, 1000, 0.5],
			[999, 1000, 1],
			[1, 2, 0.3],
		] as const;

		for (const [n, N, q] of testCases) {
			const result = calcConfidenceIndex(n, N, q);
			expect(result).toBeGreaterThanOrEqual(0);
			expect(result).toBeLessThanOrEqual(1);
		}
	});
});
