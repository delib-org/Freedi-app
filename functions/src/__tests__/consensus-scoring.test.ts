/**
 * Tests for the new consensus scoring algorithm (Mean - SEM)
 *
 * This replaces the old heuristic formula (√n × Mean) with a statistically
 * grounded approach based on the Standard Error of the Mean (SEM).
 *
 * Reference: "Consensus Scoring Update: From √n · Mean to Mean − SEM"
 * White Paper by Tal Yaron and Sivan Margalit, October 2025
 */

describe('Consensus Scoring Algorithm (Mean - SEM)', () => {
	/**
	 * Calculates standard error of the mean
	 * Note: This is a copy of the function from fn_evaluation.ts for testing
	 */
	function calcStandardError(
		sumEvaluations: number,
		sumSquaredEvaluations: number,
		numberOfEvaluators: number,
	): number {
		if (numberOfEvaluators <= 1) return 0;

		const mean = sumEvaluations / numberOfEvaluators;
		const variance = sumSquaredEvaluations / numberOfEvaluators - mean * mean;
		const safeVariance = Math.max(0, variance);
		const standardDeviation = Math.sqrt(safeVariance);
		const sem = standardDeviation / Math.sqrt(numberOfEvaluators);

		return sem;
	}

	/**
	 * Calculates consensus score using Mean - SEM
	 * Note: This is a copy of the function from fn_evaluation.ts for testing
	 */
	function calcAgreement(
		sumEvaluations: number,
		sumSquaredEvaluations: number,
		numberOfEvaluators: number,
	): number {
		if (numberOfEvaluators === 0) return 0;

		const mean = sumEvaluations / numberOfEvaluators;
		const sem = calcStandardError(sumEvaluations, sumSquaredEvaluations, numberOfEvaluators);

		return mean - sem;
	}

	/**
	 * Old formula for comparison
	 */
	function oldCalcAgreement(sumEvaluations: number, numberOfEvaluators: number): number {
		if (numberOfEvaluators === 0) return 0;
		const mean = sumEvaluations / numberOfEvaluators;

		return mean * Math.sqrt(numberOfEvaluators);
	}

	/**
	 * Helper to calculate sum of squared evaluations from individual values
	 */
	function calcSumSquared(evaluations: number[]): number {
		return evaluations.reduce((sum, val) => sum + val * val, 0);
	}

	describe('calcStandardError', () => {
		it('should return 0 for 0 evaluators', () => {
			const sem = calcStandardError(0, 0, 0);
			expect(sem).toBe(0);
		});

		it('should return 0 for 1 evaluator', () => {
			const sem = calcStandardError(0.8, 0.64, 1);
			expect(sem).toBe(0);
		});

		it('should calculate SEM correctly for uniform evaluations', () => {
			// 10 evaluators, all rated 0.8
			const evaluations = Array(10).fill(0.8);
			const sumEval = evaluations.reduce((a, b) => a + b, 0);
			const sumSquared = calcSumSquared(evaluations);

			const sem = calcStandardError(sumEval, sumSquared, 10);

			// With no variance, SEM should be 0
			expect(sem).toBeCloseTo(0, 6);
		});

		it('should calculate SEM correctly for varied evaluations', () => {
			// Example from white paper: mean=0.80, σ=0.1, n=10
			// Variance = 0.01, so sum of squares = n*(variance + mean²) = 10*(0.01 + 0.64) = 6.5
			const n = 10;
			const mean = 0.8;
			const variance = 0.01;
			const sumEval = mean * n;
			const sumSquared = n * (variance + mean * mean);

			const sem = calcStandardError(sumEval, sumSquared, n);
			const expectedSEM = Math.sqrt(variance) / Math.sqrt(n); // 0.1 / √10 ≈ 0.0316

			expect(sem).toBeCloseTo(expectedSEM, 4);
		});

		it('should handle floating point errors gracefully (no negative variance)', () => {
			// Edge case: sum of squares slightly less than it should be due to floating point
			const n = 100;
			const mean = 0.5;
			const sumEval = mean * n;
			// This would theoretically give a tiny negative variance due to floating point errors
			const sumSquared = n * mean * mean - 0.0000001;

			const sem = calcStandardError(sumEval, sumSquared, n);

			// Should not throw and should return a valid non-negative number
			expect(sem).toBeGreaterThanOrEqual(0);
			expect(sem).toBeCloseTo(0, 5);
		});
	});

	describe('calcAgreement (Mean - SEM)', () => {
		it('should return 0 for 0 evaluators', () => {
			const score = calcAgreement(0, 0, 0);
			expect(score).toBe(0);
		});

		it('should return mean for 1 evaluator (SEM = 0)', () => {
			const score = calcAgreement(0.8, 0.64, 1);
			expect(score).toBe(0.8);
		});

		it('should penalize uncertainty with small sample size', () => {
			// Small sample: 10 evaluators, mean=0.80, σ=0.1
			const n1 = 10;
			const mean = 0.8;
			const variance = 0.01;
			const sumEval = mean * n1;
			const sumSquared = n1 * (variance + mean * mean);

			const score1 = calcAgreement(sumEval, sumSquared, n1);

			// Large sample: 100 evaluators, same mean and σ
			const n2 = 100;
			const sumEval2 = mean * n2;
			const sumSquared2 = n2 * (variance + mean * mean);

			const score2 = calcAgreement(sumEval2, sumSquared2, n2);

			// Larger sample should have higher score (less uncertainty penalty)
			expect(score2).toBeGreaterThan(score1);

			// Both should be less than the mean (due to SEM penalty)
			expect(score1).toBeLessThan(mean);
			expect(score2).toBeLessThan(mean);

			// But score2 should be closer to mean (more confidence)
			expect(Math.abs(mean - score2)).toBeLessThan(Math.abs(mean - score1));
		});

		it('should match example from white paper (n=10, mean=0.80, σ=0.1)', () => {
			const n = 10;
			const mean = 0.8;
			const variance = 0.01; // σ² = 0.01, so σ = 0.1
			const sumEval = mean * n;
			const sumSquared = n * (variance + mean * mean);

			const score = calcAgreement(sumEval, sumSquared, n);
			const expectedSEM = 0.1 / Math.sqrt(10); // ≈ 0.0316
			const expectedScore = 0.8 - expectedSEM; // ≈ 0.768

			expect(score).toBeCloseTo(expectedScore, 3);
		});

		it('should match example from white paper (n=100, mean=0.80, σ=0.1)', () => {
			const n = 100;
			const mean = 0.8;
			const variance = 0.01;
			const sumEval = mean * n;
			const sumSquared = n * (variance + mean * mean);

			const score = calcAgreement(sumEval, sumSquared, n);
			const expectedSEM = 0.1 / Math.sqrt(100); // = 0.01
			const expectedScore = 0.8 - expectedSEM; // = 0.790

			expect(score).toBeCloseTo(expectedScore, 3);
		});

		it('should handle negative evaluations correctly', () => {
			// Mix of positive and negative evaluations
			const evaluations = [0.8, 0.6, -0.2, -0.4, 0.5];
			const sumEval = evaluations.reduce((a, b) => a + b, 0);
			const sumSquared = calcSumSquared(evaluations);
			const n = evaluations.length;

			const score = calcAgreement(sumEval, sumSquared, n);
			const mean = sumEval / n;

			// Score should be less than mean (due to SEM penalty)
			expect(score).toBeLessThan(mean);

			// Score should be a valid number
			expect(score).not.toBeNaN();
			expect(score).toBeDefined();
		});
	});

	describe('Comparison: Old Formula vs New Formula', () => {
		it('old formula rewards large n more than new formula', () => {
			// Scenario: high mean, high variance, small vs large sample
			const mean = 0.8;
			const variance = 0.04; // σ = 0.2 (high variance)

			const n1 = 10;
			const n2 = 100;

			const sumEval1 = mean * n1;
			const sumSquared1 = n1 * (variance + mean * mean);
			const sumEval2 = mean * n2;
			const sumSquared2 = n2 * (variance + mean * mean);

			// Old formula
			const oldScore1 = oldCalcAgreement(sumEval1, n1);
			const oldScore2 = oldCalcAgreement(sumEval2, n2);

			// New formula
			const newScore1 = calcAgreement(sumEval1, sumSquared1, n1);
			const newScore2 = calcAgreement(sumEval2, sumSquared2, n2);

			// Old formula: score increases dramatically with √n
			// Old: 0.8 × √10 ≈ 2.53 vs 0.8 × √100 = 8.0
			expect(oldScore2 / oldScore1).toBeCloseTo(Math.sqrt(n2) / Math.sqrt(n1), 1);

			// New formula: score approaches mean as n increases (less dramatic)
			// Both should be close to 0.8, with n2 slightly closer
			expect(newScore1).toBeLessThan(mean);
			expect(newScore2).toBeLessThan(mean);
			expect(newScore2).toBeGreaterThan(newScore1);
			expect(newScore2).toBeCloseTo(mean, 1);
		});

		it('new formula is more fair to proposals with different sample sizes', () => {
			// Scenario from white paper:
			// Proposal A: 10 evaluators, mean=0.85
			// Proposal B: 100 evaluators, mean=0.80

			const variance = 0.01; // σ = 0.1

			const nA = 10;
			const meanA = 0.85;
			const sumEvalA = meanA * nA;
			const sumSquaredA = nA * (variance + meanA * meanA);

			const nB = 100;
			const meanB = 0.8;
			const sumEvalB = meanB * nB;
			const sumSquaredB = nB * (variance + meanB * meanB);

			// Old formula unfairly favors B due to larger sample
			const oldScoreA = oldCalcAgreement(sumEvalA, nA);
			const oldScoreB = oldCalcAgreement(sumEvalB, nB);
			expect(oldScoreB).toBeGreaterThan(oldScoreA); // 8.0 > 2.69

			// New formula correctly recognizes that A has higher support
			const newScoreA = calcAgreement(sumEvalA, sumSquaredA, nA);
			const newScoreB = calcAgreement(sumEvalB, sumSquaredB, nB);

			// With new formula, scores should be much closer, with A potentially higher
			// depending on the confidence adjustment
			const scoreDiff = Math.abs(newScoreA - newScoreB);
			expect(scoreDiff).toBeLessThan(0.1); // Much closer than old formula
		});
	});

	describe('Edge Cases and Robustness', () => {
		it('should handle all evaluations being 0', () => {
			const evaluations = [0, 0, 0, 0, 0];
			const sumEval = 0;
			const sumSquared = 0;
			const n = evaluations.length;

			const score = calcAgreement(sumEval, sumSquared, n);

			expect(score).toBe(0);
		});

		it('should handle all evaluations being the same positive value', () => {
			const evaluations = Array(20).fill(0.7);
			const sumEval = evaluations.reduce((a, b) => a + b, 0);
			const sumSquared = calcSumSquared(evaluations);
			const n = evaluations.length;

			const score = calcAgreement(sumEval, sumSquared, n);

			// With no variance, score should equal mean (SEM = 0)
			expect(score).toBeCloseTo(0.7, 6);
		});

		it('should handle all evaluations being the same negative value', () => {
			const evaluations = Array(20).fill(-0.3);
			const sumEval = evaluations.reduce((a, b) => a + b, 0);
			const sumSquared = calcSumSquared(evaluations);
			const n = evaluations.length;

			const score = calcAgreement(sumEval, sumSquared, n);

			// With no variance, score should equal mean (SEM = 0)
			expect(score).toBeCloseTo(-0.3, 6);
		});

		it('should handle extreme variance', () => {
			// Half rate 1.0, half rate -1.0
			const evaluations = [...Array(50).fill(1.0), ...Array(50).fill(-1.0)];
			const sumEval = evaluations.reduce((a, b) => a + b, 0);
			const sumSquared = calcSumSquared(evaluations);
			const n = evaluations.length;

			const score = calcAgreement(sumEval, sumSquared, n);
			const mean = sumEval / n; // Should be 0

			// Mean should be 0
			expect(mean).toBe(0);

			// Score should be negative (penalized for high uncertainty)
			expect(score).toBeLessThan(0);
		});

		it('should produce consistent results for mathematically equivalent inputs', () => {
			// Test that scaling evaluations doesn't affect the formula incorrectly
			const evaluations1 = [0.8, 0.6, 0.9, 0.7];
			const sumEval1 = evaluations1.reduce((a, b) => a + b, 0);
			const sumSquared1 = calcSumSquared(evaluations1);
			const n1 = evaluations1.length;

			const score1 = calcAgreement(sumEval1, sumSquared1, n1);

			// Same evaluations, but duplicated
			const evaluations2 = [...evaluations1, ...evaluations1];
			const sumEval2 = evaluations2.reduce((a, b) => a + b, 0);
			const sumSquared2 = calcSumSquared(evaluations2);
			const n2 = evaluations2.length;

			const score2 = calcAgreement(sumEval2, sumSquared2, n2);

			// Mean should be the same
			expect(sumEval1 / n1).toBeCloseTo(sumEval2 / n2, 6);

			// Score for larger sample should be closer to mean (higher confidence)
			expect(score2).toBeGreaterThan(score1);
		});
	});
});
