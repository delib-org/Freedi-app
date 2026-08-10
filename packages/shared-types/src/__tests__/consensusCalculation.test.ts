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
	calcLikeMindedness,
	finitePopulationFactor,
	isPopulationOversubscribed,
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

// ============================================================================
// FINITE POPULATION CORRECTION
// ============================================================================

describe('finitePopulationFactor', () => {
	it('is inert when no population is declared', () => {
		expect(finitePopulationFactor(10)).toBe(1);
		expect(finitePopulationFactor(10, undefined)).toBe(1);
	});

	it('is inert for degenerate populations rather than producing NaN', () => {
		// A zero, negative or non-finite N is bad data, not a census. Treating
		// it as "unknown population" is the only safe reading: the alternative
		// (coverage = n/0 = Infinity) would clamp to a census and hand a
		// perfect score to whoever wrote the broken value.
		for (const bad of [0, -5, NaN, Infinity, -Infinity]) {
			expect(finitePopulationFactor(10, bad)).toBe(1);
		}
	});

	it('is exactly zero at a census', () => {
		expect(finitePopulationFactor(30, 30)).toBe(0);
		expect(finitePopulationFactor(1, 1)).toBe(0);
	});

	it('clamps when more people evaluated than the population allows', () => {
		expect(finitePopulationFactor(40, 30)).toBe(0);
	});

	it('approaches 1 as the sample becomes negligible', () => {
		expect(finitePopulationFactor(5, 1_000_000)).toBeCloseTo(1, 5);
	});

	it('decreases monotonically as coverage rises', () => {
		const factors = [1, 5, 10, 20, 29, 30].map((n) => finitePopulationFactor(n, 30));
		for (let i = 1; i < factors.length; i++) {
			expect(factors[i]).toBeLessThan(factors[i - 1]);
		}
	});
});

describe('isPopulationOversubscribed', () => {
	it('is false when no population is declared or the count fits', () => {
		expect(isPopulationOversubscribed(10)).toBe(false);
		expect(isPopulationOversubscribed(10, 30)).toBe(false);
		expect(isPopulationOversubscribed(30, 30)).toBe(false);
	});

	it('is true when more evaluated than exist', () => {
		expect(isPopulationOversubscribed(31, 30)).toBe(true);
	});
});

describe('finite-population correction - regression lock', () => {
	// The whole point of the optional parameter: every existing caller (the
	// evaluation trigger, condensation, strategic export, Sign, the main app)
	// passes three arguments, and none of their stored scores may shift by so
	// much as one float ULP because this parameter was added. `toBe` on the
	// exact double is deliberate — `toBeCloseTo` would hide precisely the kind
	// of drift this test exists to catch.
	const CASES: ReadonlyArray<readonly [number, number, number]> = [
		[5, 5, 5],
		[6, 6, 6],
		[3, 3, 3],
		[-5, 2.5, 10],
		[0, 10, 10],
		[9, 11, 15],
		[2, 4, 5],
		[29, 29, 29],
		[1, 15, 15],
		[100, 100, 100],
	];

	it('calcAgreement is bit-identical to the pre-correction values', () => {
		const expected = [
			0.32960130909890284, 0.3797156470041917, 0.1742799505885788,
			-0.747166365270868, -0.49433273054173593, 0.24887954555535818,
			-0.1996228179526892, 0.700332691641339, -0.34335368792133497,
			0.8364610699128561,
		];
		CASES.forEach(([sum, sumSq, n], index) => {
			expect(calcAgreement(sum, sumSq, n)).toBe(expected[index]);
		});
	});

	it('calcSmoothedSEM is bit-identical to the pre-correction values', () => {
		const expected = [
			0.3450327796711771, 0.32732683535398854, 0.38729833462074165,
			0.13762047064079508, 0.27524094128159016, 0.20109991663496093,
			0.3086066999241838, 0.1765865105236658, 0.23483410915693106,
			0.09852336290568345,
		];
		CASES.forEach(([sum, sumSq, n], index) => {
			expect(calcSmoothedSEM(sum, sumSq, n)).toBe(expected[index]);
		});
	});

	it('passing undefined is bit-identical to omitting the argument', () => {
		for (const [sum, sumSq, n] of CASES) {
			expect(calcAgreement(sum, sumSq, n, undefined)).toBe(calcAgreement(sum, sumSq, n));
			expect(calcSmoothedSEM(sum, sumSq, n, undefined)).toBe(calcSmoothedSEM(sum, sumSq, n));
			expect(calcAgreementIndex(sum, sumSq, n, undefined)).toBe(
				calcAgreementIndex(sum, sumSq, n),
			);
		}
		expect(calcBinaryConsensus(7, 3, undefined)).toBe(calcBinaryConsensus(7, 3));
	});

	it('a degenerate population leaves every score untouched', () => {
		for (const [sum, sumSq, n] of CASES) {
			for (const bad of [0, -1, NaN, Infinity]) {
				expect(calcAgreement(sum, sumSq, n, bad)).toBe(calcAgreement(sum, sumSq, n));
			}
		}
	});

	it('a vast population recovers the uncorrected score', () => {
		for (const [sum, sumSq, n] of CASES) {
			expect(calcAgreement(sum, sumSq, n, 10_000_000)).toBeCloseTo(
				calcAgreement(sum, sumSq, n),
				4,
			);
		}
	});
});

describe('finite-population correction - census behaviour', () => {
	it('returns exactly the mean when every stakeholder has spoken', () => {
		// The reason the correction exists. A class of 6 where all 5 peers rate
		// +1 scored 0.33 before this: the formula was hedging against students
		// who do not exist.
		expect(calcAgreement(5, 5, 5, 5)).toBe(1);
		expect(calcAgreement(-2.5, 1.25, 5, 5)).toBe(-0.5);
		expect(calcAgreement(2, 4, 5, 5)).toBe(calcMeanSentiment(2, 5));
	});

	it('equals the mean at census across a table of shapes', () => {
		const cases: ReadonlyArray<readonly [number, number, number]> = [
			[5, 5, 5],
			[9, 11, 15],
			[29, 29, 29],
			[-5, 2.5, 10],
			[1, 15, 15],
		];
		for (const [sum, sumSq, n] of cases) {
			expect(calcAgreement(sum, sumSq, n, n)).toBe(calcMeanSentiment(sum, n));
		}
	});

	it('reports a perfectly reliable sample at census', () => {
		expect(calcAgreementIndex(5, 5, 5, 5)).toBe(1);
	});

	it('never exceeds the mean, at any population size', () => {
		const cases: ReadonlyArray<readonly [number, number, number]> = [
			[5, 5, 5],
			[9, 11, 15],
			[-5, 2.5, 10],
			[0, 10, 10],
		];
		for (const [sum, sumSq, n] of cases) {
			for (const N of [1, 2, n - 1, n, n + 1, 50, 500]) {
				expect(calcAgreement(sum, sumSq, n, N)).toBeLessThanOrEqual(
					calcMeanSentiment(sum, n) + Number.EPSILON,
				);
			}
		}
	});

	it('stays within [-1, 1] for every population size', () => {
		const cases: ReadonlyArray<readonly [number, number, number]> = [
			[3, 3, 3],
			[-3, 3, 3],
			[0, 10, 10],
			[1000, 1000, 1000],
			[-1000, 1000, 1000],
		];
		for (const [sum, sumSq, n] of cases) {
			for (const N of [1, n, n * 2, 1000, 100000]) {
				const result = calcAgreement(sum, sumSq, n, N);
				expect(result).toBeGreaterThanOrEqual(-1);
				expect(result).toBeLessThanOrEqual(1);
			}
		}
	});
});

describe('finite-population correction - monotonicity', () => {
	it('rises with coverage when the population is fixed', () => {
		// A class of 5 peers, unanimously in favour, as more of them weigh in.
		const scores = [3, 4, 5].map((n) => calcAgreement(n, n, n, 5));
		expect(scores[0]).toBeLessThan(scores[1]);
		expect(scores[1]).toBeLessThan(scores[2]);
		expect(scores[2]).toBe(1);
	});

	it('falls as the stakeholder population grows for a fixed sample', () => {
		// The same three votes say less about a settlement than about a family.
		const scores = [3, 10, 100].map((N) => calcAgreement(3, 3, 3, N));
		expect(scores[0]).toBeGreaterThan(scores[1]);
		expect(scores[1]).toBeGreaterThan(scores[2]);
	});
});

describe('finite-population correction - disagreement is not launderable', () => {
	it('gives a balanced census exactly zero, not a positive score', () => {
		// SURPRISING BUT INTENDED. At a census the correction removes ALL
		// sampling error by construction, so C_p reports the mean and nothing
		// else — and the mean of a 3-for / 3-against split is 0. The penalty
		// for a group being genuinely divided is NOT in C_p; it lives in
		// calcLikeMindedness, which takes no population for exactly this reason.
		expect(calcAgreement(0, 6, 6, 6)).toBe(0);
	});

	it('keeps a negatively-tilted census negative', () => {
		expect(calcAgreement(-2, 5, 6, 6)).toBeLessThan(0);
	});

	it('keeps a split group negative while coverage is partial', () => {
		expect(calcAgreement(0, 6, 6, 12)).toBeLessThan(0);
		// 15 of 29 classmates, 8 for and 7 against: still negative, because
		// half the class has not spoken and the half that did is at war.
		expect(calcAgreement(1, 15, 15, 29)).toBeLessThan(0);
	});

	it('pins the pre-existing blind spot: no metric here detects polarisation', () => {
		// Worth pinning precisely because it bounds what the census property
		// above can mean. SEM* is built from the sum of SQUARES, which discards
		// sign, so six votes of +1 and a 3-3 split of ±1 are indistinguishable
		// to like-mindedness. C_p at a census reports the plain mean. So a
		// divided group is penalised by NEITHER number and is visible only in
		// the distribution of its votes.
		//
		// This gap predates the finite-population work and is out of scope
		// here, but it must not be papered over: it is the reason a results
		// screen has to show the shape of opinion, not just its centre.
		expect(calcLikeMindedness(0, 6, 6)).toBe(calcLikeMindedness(6, 6, 6));
	});
});
