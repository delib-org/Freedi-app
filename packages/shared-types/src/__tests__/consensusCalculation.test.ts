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
	calcAgreement,
	calcSmoothedSEM,
	calcMeanSentiment,
	calcBinaryConsensus,
	tCritical,
	BAYESIAN_PRIOR_K,
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

describe('calcAgreementIndex (A_p = 1 - t · SEM*)', () => {
	it('should return 0 when n <= 0', () => {
		expect(calcAgreementIndex(0, 0, 0)).toBe(0);
		expect(calcAgreementIndex(5, 5, -1)).toBe(0);
	});

	it('should increase with sample size for unanimous votes (sample-size aware)', () => {
		// 3 unanimous +1 votes should have lower A_p than 1000 unanimous votes
		const a3 = calcAgreementIndex(3, 3, 3);
		const a1000 = calcAgreementIndex(1000, 1000, 1000);
		expect(a3).toBeLessThan(a1000);
		// Small unanimous sample gets heavily penalized
		expect(a3).toBeLessThan(0.5);
		expect(a3).toBeGreaterThan(0);
	});

	it('should be high for large near-unanimous samples', () => {
		// 1000 votes, 990 positive [+1], 10 negative [-1]
		// sum = 980, sumSq = 1000, n = 1000
		const a1000 = calcAgreementIndex(980, 1000, 1000);
		expect(a1000).toBeGreaterThan(0.9);
	});

	it('should be low for maximum polarization with small sample', () => {
		// Half +1, half -1: sum=0, sumSq=4, n=4
		// With Bayesian smoothing and t-distribution, even polarized
		// small samples don't hit exactly 0
		const result = calcAgreementIndex(0, 4, 4);
		expect(result).toBeLessThan(0.5);
	});

	it('should have high A_p for large polarized samples (confirmed division)', () => {
		// 500 votes +1, 500 votes -1: mean ≈ 0, high variance
		// Per paper Section 5.4: high A_p + low μ = "confirmed division"
		// A_p measures sample reliability, not agreement direction
		const result = calcAgreementIndex(0, 1000, 1000);
		expect(result).toBeGreaterThan(0.9);
	});

	it('should return values between 0 and 1 for mixed evaluations', () => {
		// 3 evaluators: +1, +0.5, +0.5 → sum=2, sumSq=1.5, n=3
		const result = calcAgreementIndex(2, 1.5, 3);
		expect(result).toBeGreaterThan(0);
		expect(result).toBeLessThan(1);
	});

	it('should always be in [0, 1] range', () => {
		const testCases = [
			[3, 3, 3],
			[0, 10, 10],
			[-5, 5, 5],
			[100, 100, 100],
		] as const;
		for (const [sum, sumSq, n] of testCases) {
			const result = calcAgreementIndex(sum, sumSq, n);
			expect(result).toBeGreaterThanOrEqual(0);
			expect(result).toBeLessThanOrEqual(1);
		}
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

// ============================================================================
// WizCol Scoring Engine Tests
// ============================================================================

describe('tCritical', () => {
	it('should return exact table values for known df', () => {
		expect(tCritical(1)).toBeCloseTo(6.314, 2);
		expect(tCritical(2)).toBeCloseTo(2.920, 2);
		expect(tCritical(5)).toBeCloseTo(2.015, 2);
		expect(tCritical(10)).toBeCloseTo(1.812, 2);
		expect(tCritical(30)).toBeCloseTo(1.697, 2);
	});

	it('should interpolate for intermediate df', () => {
		const t22 = tCritical(22);
		// Between df=20 (1.725) and df=25 (1.708)
		expect(t22).toBeGreaterThan(1.708);
		expect(t22).toBeLessThan(1.725);
	});

	it('should return z_0.05 = 1.645 for large df', () => {
		expect(tCritical(200)).toBeCloseTo(1.645, 2);
		expect(tCritical(1000)).toBeCloseTo(1.645, 2);
	});

	it('should decrease monotonically with df', () => {
		let prev = tCritical(1);
		for (const df of [2, 5, 10, 20, 50, 100]) {
			const current = tCritical(df);
			expect(current).toBeLessThanOrEqual(prev);
			prev = current;
		}
	});
});

describe('calcSmoothedSEM (Bayesian k=2 phantom priors)', () => {
	it('should return 1 for 0 evaluators', () => {
		expect(calcSmoothedSEM(0, 0, 0)).toBe(1);
	});

	it('should give non-zero SEM for unanimous votes', () => {
		// 3 votes of +1: sum=3, sumSq=3, n=3
		// σ̂* = √(3 / (3+2-1)) = √(3/4) = 0.866
		// SEM* = 0.866 / √(3+2) = 0.866 / 2.236 ≈ 0.387
		const sem = calcSmoothedSEM(3, 3, 3);
		expect(sem).toBeGreaterThan(0.3);
		expect(sem).toBeLessThan(0.5);
	});

	it('should decrease as n grows (with same distribution)', () => {
		// All +1 votes: sum=n, sumSq=n
		const sem5 = calcSmoothedSEM(5, 5, 5);
		const sem50 = calcSmoothedSEM(50, 50, 50);
		const sem500 = calcSmoothedSEM(500, 500, 500);
		expect(sem50).toBeLessThan(sem5);
		expect(sem500).toBeLessThan(sem50);
	});

	it('should converge to regular SEM for large n', () => {
		// For large n, the k=2 priors become negligible
		const n = 1000;
		const sum = 800; // mean = 0.8
		const sumSq = 700; // var ≈ 0.06
		const sem = calcSmoothedSEM(sum, sumSq, n);
		// SEM* should be small for large n
		expect(sem).toBeLessThan(0.03);
		expect(sem).toBeGreaterThan(0);
	});
});

describe('calcAgreement (C_p = μ - t · SEM*)', () => {
	it('should return 0 for no evaluators', () => {
		expect(calcAgreement(0, 0, 0)).toBe(0);
	});

	it('should heavily penalize small unanimous samples', () => {
		// 3 votes of +1 → C_p should be well below 1.0
		const score = calcAgreement(3, 3, 3);
		expect(score).toBeLessThan(0.2);
		expect(score).toBeGreaterThan(-1);
	});

	it('should reward large samples with genuine consensus', () => {
		// 100 votes of +0.95 (with natural variance)
		// sum = 95, sumSq ≈ 90.25, n = 100
		const score = calcAgreement(95, 90.25, 100);
		expect(score).toBeGreaterThan(0.75);
	});

	it('should ensure large sample > small unanimous sample', () => {
		const smallUnanimous = calcAgreement(3, 3, 3);
		const largeSample = calcAgreement(95, 90.25, 100);
		expect(largeSample).toBeGreaterThan(smallUnanimous);
	});

	it('should return negative for proposals with negative sentiment', () => {
		// 10 votes of -0.5: sum=-5, sumSq=2.5, n=10
		const score = calcAgreement(-5, 2.5, 10);
		expect(score).toBeLessThan(0);
	});

	it('should stay within [-1, 1]', () => {
		const testCases = [
			[3, 3, 3],
			[-3, 3, 3],
			[0, 10, 10],
			[1000, 1000, 1000],
			[-1000, 1000, 1000],
		] as const;
		for (const [sum, sumSq, n] of testCases) {
			const result = calcAgreement(sum, sumSq, n);
			expect(result).toBeGreaterThanOrEqual(-1);
			expect(result).toBeLessThanOrEqual(1);
		}
	});
});

describe('calcBinaryConsensus', () => {
	it('should return 0 for no votes', () => {
		expect(calcBinaryConsensus(0, 0)).toBe(0);
	});

	it('should penalize small unanimous binary votes', () => {
		const score = calcBinaryConsensus(3, 0);
		expect(score).toBeLessThan(0.5);
		expect(score).toBeGreaterThan(-1);
	});

	it('should return near 0 for evenly split votes', () => {
		const score = calcBinaryConsensus(50, 50);
		expect(Math.abs(score)).toBeLessThan(0.5);
	});
});

describe('calcMeanSentiment', () => {
	it('should return 0 for no evaluators', () => {
		expect(calcMeanSentiment(0, 0)).toBe(0);
	});

	it('should return the simple mean', () => {
		expect(calcMeanSentiment(10, 5)).toBe(2);
		expect(calcMeanSentiment(3, 3)).toBe(1);
		expect(calcMeanSentiment(-5, 10)).toBe(-0.5);
	});
});
