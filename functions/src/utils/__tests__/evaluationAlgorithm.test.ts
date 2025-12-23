/**
 * Comprehensive tests for the Mean-SEM Algorithm
 *
 * These tests verify that the algorithm correctly calculates consensus scores
 * after each evaluation operation (add, update, delete).
 *
 * Reference: "Consensus Scoring Update: From √n · Mean to Mean − SEM"
 * White Paper by Tal Yaron and Sivan Margalit, October 2025
 */

import {
	FLOOR_STD_DEV,
	calcSquaredDiff,
	calcStandardError,
	calcRawStandardError,
	calcAgreement,
	calcEvaluationDetails,
	calcSumSquared,
	calcSum,
	simulateAddEvaluation,
	simulateUpdateEvaluation,
	simulateDeleteEvaluation,
	calcOldAgreement,
} from '../evaluationAlgorithm';

describe('Mean-SEM Algorithm (evaluationAlgorithm.ts)', () => {
	describe('Constants', () => {
		it('should have FLOOR_STD_DEV = 0.5', () => {
			expect(FLOOR_STD_DEV).toBe(0.5);
		});
	});

	describe('calcSquaredDiff', () => {
		it('should calculate squared difference correctly for positive values', () => {
			// new² - old² = 0.8² - 0.5² = 0.64 - 0.25 = 0.39
			expect(calcSquaredDiff(0.8, 0.5)).toBeCloseTo(0.39, 6);
		});

		it('should calculate squared difference correctly for new evaluation (old = 0)', () => {
			// new² - 0² = 0.7² = 0.49
			expect(calcSquaredDiff(0.7, 0)).toBeCloseTo(0.49, 6);
		});

		it('should calculate squared difference correctly for deletion (new = 0)', () => {
			// 0² - old² = -0.6² = -0.36
			expect(calcSquaredDiff(0, 0.6)).toBeCloseTo(-0.36, 6);
		});

		it('should calculate squared difference correctly for negative values', () => {
			// (-0.3)² - (-0.5)² = 0.09 - 0.25 = -0.16
			expect(calcSquaredDiff(-0.3, -0.5)).toBeCloseTo(-0.16, 6);
		});

		it('should return 0 when both values are the same', () => {
			expect(calcSquaredDiff(0.5, 0.5)).toBe(0);
			expect(calcSquaredDiff(-0.3, -0.3)).toBe(0);
		});
	});

	describe('calcStandardError (with Uncertainty Floor)', () => {
		it('should return FLOOR_STD_DEV for 0 evaluators', () => {
			// Edge case: n=0 → should still return floor (though technically undefined)
			const sem = calcStandardError(0, 0, 0);
			// With n=0, the function should handle gracefully
			expect(sem).toBe(FLOOR_STD_DEV);
		});

		it('should return FLOOR_STD_DEV for 1 evaluator', () => {
			const sem = calcStandardError(0.8, 0.64, 1);
			expect(sem).toBe(FLOOR_STD_DEV);
		});

		it('should apply uncertainty floor for small unanimous samples', () => {
			// 3 evaluators, all rated 1.0 (no variance)
			const sumEval = 3.0;
			const sumSquared = 3.0; // 1² + 1² + 1² = 3
			const n = 3;

			const sem = calcStandardError(sumEval, sumSquared, n);

			// With no observed variance, floor should be applied
			// SEM = 0.5 / √3 ≈ 0.289
			expect(sem).toBeCloseTo(FLOOR_STD_DEV / Math.sqrt(n), 4);
		});

		it('should calculate SEM correctly for varied evaluations', () => {
			// From white paper: mean=0.80, σ=0.1, n=10
			const n = 10;
			const mean = 0.80;
			const variance = 0.01; // σ² = 0.01, so σ = 0.1
			const sumEval = mean * n;
			const sumSquared = n * (variance + mean * mean);

			const sem = calcStandardError(sumEval, sumSquared, n);

			// σ=0.1 < 0.5 (floor), so floor applies
			// SEM = 0.5 / √10 ≈ 0.158
			expect(sem).toBeCloseTo(FLOOR_STD_DEV / Math.sqrt(n), 4);
		});

		it('should use observed stddev when it exceeds the floor', () => {
			// Create high variance scenario: σ = 0.8 > FLOOR_STD_DEV
			const n = 10;
			const mean = 0.5;
			const stdDev = 0.8;
			const variance = stdDev * stdDev; // 0.64
			const sumEval = mean * n;
			const sumSquared = n * (variance + mean * mean);

			const sem = calcStandardError(sumEval, sumSquared, n);

			// Since σ=0.8 > 0.5 (floor), should use actual stddev
			// SEM = 0.8 / √10 ≈ 0.253
			expect(sem).toBeCloseTo(stdDev / Math.sqrt(n), 4);
		});

		it('should handle floating point errors gracefully', () => {
			const n = 100;
			const mean = 0.5;
			const sumEval = mean * n;
			// This could theoretically give tiny negative variance due to floating point
			const sumSquared = n * mean * mean - 0.0000001;

			const sem = calcStandardError(sumEval, sumSquared, n);

			// Should not throw and should return a valid non-negative number
			expect(sem).toBeGreaterThanOrEqual(0);
			expect(Number.isFinite(sem)).toBe(true);
		});
	});

	describe('calcRawStandardError (without floor)', () => {
		it('should return 0 for uniform evaluations', () => {
			// 10 evaluators, all rated 0.8
			const n = 10;
			const sumEval = 0.8 * n;
			const sumSquared = 0.64 * n; // 0.8² × 10

			const rawSem = calcRawStandardError(sumEval, sumSquared, n);

			expect(rawSem).toBeCloseTo(0, 6);
		});

		it('should return 0 for n <= 1', () => {
			expect(calcRawStandardError(0.8, 0.64, 1)).toBe(0);
			expect(calcRawStandardError(0, 0, 0)).toBe(0);
		});

		it('should calculate correctly for varied evaluations', () => {
			// mean=0.80, σ=0.1, n=10
			const n = 10;
			const mean = 0.80;
			const variance = 0.01;
			const sumEval = mean * n;
			const sumSquared = n * (variance + mean * mean);

			const rawSem = calcRawStandardError(sumEval, sumSquared, n);
			const expectedRawSEM = Math.sqrt(variance) / Math.sqrt(n); // 0.1 / √10 ≈ 0.0316

			expect(rawSem).toBeCloseTo(expectedRawSEM, 4);
		});
	});

	describe('calcAgreement (Mean - SEM with floor)', () => {
		it('should return 0 for 0 evaluators', () => {
			expect(calcAgreement(0, 0, 0)).toBe(0);
		});

		it('should penalize single evaluator with floor', () => {
			// n=1, evaluation=0.8
			// SEM = FLOOR_STD_DEV = 0.5
			// Score = 0.8 - 0.5 = 0.3
			const score = calcAgreement(0.8, 0.64, 1);
			expect(score).toBeCloseTo(0.3, 4);
		});

		it('should penalize small unanimous groups (Zero Variance Loophole prevention)', () => {
			// 3 people all vote 1.0
			const n = 3;
			const sumEval = 3.0;
			const sumSquared = 3.0; // 1² + 1² + 1²

			const score = calcAgreement(sumEval, sumSquared, n);

			// Mean = 1.0
			// SEM = 0.5 / √3 ≈ 0.289
			// Score = 1.0 - 0.289 ≈ 0.711
			expect(score).toBeCloseTo(1.0 - (FLOOR_STD_DEV / Math.sqrt(n)), 3);
			expect(score).toBeLessThan(1.0); // Must be less than perfect score
		});

		it('should match white paper example (n=10, mean=0.80, σ=0.1)', () => {
			const n = 10;
			const mean = 0.80;
			const variance = 0.01;
			const sumEval = mean * n;
			const sumSquared = n * (variance + mean * mean);

			const score = calcAgreement(sumEval, sumSquared, n);

			// σ=0.1 < 0.5, so floor applies
			// SEM = 0.5 / √10 ≈ 0.158
			// Score = 0.80 - 0.158 ≈ 0.642
			const expectedSEM = FLOOR_STD_DEV / Math.sqrt(n);
			expect(score).toBeCloseTo(mean - expectedSEM, 3);
		});

		it('should match white paper example (n=100, mean=0.80, σ=0.1)', () => {
			const n = 100;
			const mean = 0.80;
			const variance = 0.01;
			const sumEval = mean * n;
			const sumSquared = n * (variance + mean * mean);

			const score = calcAgreement(sumEval, sumSquared, n);

			// σ=0.1 < 0.5, so floor applies
			// SEM = 0.5 / √100 = 0.05
			// Score = 0.80 - 0.05 = 0.75
			const expectedSEM = FLOOR_STD_DEV / Math.sqrt(n);
			expect(score).toBeCloseTo(mean - expectedSEM, 3);
		});

		it('should show larger sample has higher score with same parameters', () => {
			const mean = 0.80;
			const variance = 0.01;

			const n1 = 10;
			const score1 = calcAgreement(mean * n1, n1 * (variance + mean * mean), n1);

			const n2 = 100;
			const score2 = calcAgreement(mean * n2, n2 * (variance + mean * mean), n2);

			// Larger sample should have higher confidence (closer to mean)
			expect(score2).toBeGreaterThan(score1);
			expect(score2).toBeLessThan(mean);
			expect(score1).toBeLessThan(mean);
		});

		it('should handle negative evaluations correctly', () => {
			// Mix of positive and negative evaluations
			const evaluations = [0.8, 0.6, -0.2, -0.4, 0.5];
			const sumEval = calcSum(evaluations);
			const sumSquared = calcSumSquared(evaluations);
			const n = evaluations.length;

			const score = calcAgreement(sumEval, sumSquared, n);
			const mean = sumEval / n;

			expect(score).toBeLessThan(mean); // Due to SEM penalty
			expect(Number.isFinite(score)).toBe(true);
		});

		it('should handle all negative evaluations', () => {
			const evaluations = [-0.3, -0.5, -0.7, -0.4];
			const sumEval = calcSum(evaluations);
			const sumSquared = calcSumSquared(evaluations);
			const n = evaluations.length;

			const score = calcAgreement(sumEval, sumSquared, n);
			const mean = sumEval / n;

			// Score should be less than mean (penalty goes towards -1)
			expect(score).toBeLessThan(mean);
			expect(score).toBeGreaterThanOrEqual(-1);
		});

		it('should handle extreme variance (half +1, half -1)', () => {
			const evaluations = [...Array(50).fill(1.0), ...Array(50).fill(-1.0)];
			const sumEval = calcSum(evaluations);
			const sumSquared = calcSumSquared(evaluations);
			const n = evaluations.length;

			const score = calcAgreement(sumEval, sumSquared, n);
			const mean = sumEval / n;

			expect(mean).toBe(0); // Mean should be 0
			expect(score).toBeLessThan(0); // Score penalized for uncertainty
		});

		it('should handle invalid inputs gracefully', () => {
			expect(calcAgreement(NaN, 0, 10)).toBe(0);
			expect(calcAgreement(0, NaN, 10)).toBe(0);
			expect(calcAgreement(0, 0, NaN)).toBe(0);
		});
	});

	describe('calcEvaluationDetails', () => {
		it('should return all computed values', () => {
			const n = 10;
			const mean = 0.8;
			const variance = 0.04; // σ = 0.2
			const sumEval = mean * n;
			const sumSquared = n * (variance + mean * mean);

			const result = calcEvaluationDetails(sumEval, sumSquared, n);

			expect(result.mean).toBeCloseTo(mean, 6);
			expect(result.standardDeviation).toBeCloseTo(0.2, 4);
			expect(result.adjustedStandardDeviation).toBe(FLOOR_STD_DEV); // 0.2 < 0.5
			expect(result.sem).toBeCloseTo(FLOOR_STD_DEV / Math.sqrt(n), 4);
			expect(result.agreement).toBeCloseTo(mean - result.sem, 6);
		});

		it('should use observed stddev when it exceeds floor', () => {
			const n = 10;
			const mean = 0.5;
			const stdDev = 0.8;
			const variance = stdDev * stdDev;
			const sumEval = mean * n;
			const sumSquared = n * (variance + mean * mean);

			const result = calcEvaluationDetails(sumEval, sumSquared, n);

			expect(result.standardDeviation).toBeCloseTo(stdDev, 4);
			expect(result.adjustedStandardDeviation).toBeCloseTo(stdDev, 4);
			expect(result.sem).toBeCloseTo(stdDev / Math.sqrt(n), 4);
		});

		it('should return zeros for n=0', () => {
			const result = calcEvaluationDetails(0, 0, 0);

			expect(result.agreement).toBe(0);
			expect(result.mean).toBe(0);
			expect(result.standardDeviation).toBe(0);
			expect(result.adjustedStandardDeviation).toBe(FLOOR_STD_DEV);
		});
	});

	describe('Helper functions', () => {
		it('calcSumSquared should calculate sum of squares correctly', () => {
			const evaluations = [0.5, 0.8, -0.3];
			const expected = 0.25 + 0.64 + 0.09;
			expect(calcSumSquared(evaluations)).toBeCloseTo(expected, 6);
		});

		it('calcSum should calculate sum correctly', () => {
			const evaluations = [0.5, 0.8, -0.3];
			expect(calcSum(evaluations)).toBeCloseTo(1.0, 6);
		});
	});

	describe('End-to-End Evaluation Scenarios', () => {
		describe('Adding evaluations', () => {
			it('should correctly update agreement after first evaluation', () => {
				const result = simulateAddEvaluation(0, 0, 0, 0.8);

				expect(result.mean).toBeCloseTo(0.8, 6);
				// n=1, SEM = 0.5, agreement = 0.8 - 0.5 = 0.3
				expect(result.agreement).toBeCloseTo(0.3, 4);
			});

			it('should correctly update agreement after second evaluation', () => {
				// After first: sum=0.8, sumSq=0.64, n=1
				const result = simulateAddEvaluation(0.8, 0.64, 1, 0.6);

				// After second: sum=1.4, sumSq=1.0, n=2
				expect(result.mean).toBeCloseTo(0.7, 6);
				// SEM = 0.5 / √2 ≈ 0.354 (floor applies since variance is low)
				expect(result.agreement).toBeCloseTo(0.7 - (FLOOR_STD_DEV / Math.sqrt(2)), 3);
			});

			it('should show increasing confidence as evaluators grow', () => {
				const evaluations: number[] = [];
				let sum = 0;
				let sumSq = 0;
				const scores: number[] = [];

				// Add 20 evaluators all voting 0.8
				for (let i = 0; i < 20; i++) {
					evaluations.push(0.8);
					sum += 0.8;
					sumSq += 0.64;
					const result = calcEvaluationDetails(sum, sumSq, evaluations.length);
					scores.push(result.agreement);
				}

				// Each additional evaluator should increase the score (more confidence)
				for (let i = 1; i < scores.length; i++) {
					expect(scores[i]).toBeGreaterThan(scores[i - 1]);
				}

				// Final score should approach mean as n increases
				expect(scores[scores.length - 1]).toBeLessThan(0.8);
				expect(scores[scores.length - 1]).toBeGreaterThan(0.6);
			});
		});

		describe('Updating evaluations', () => {
			it('should correctly update agreement when evaluation increases', () => {
				// Start: 3 evaluators with [0.5, 0.6, 0.7]
				const initial = [0.5, 0.6, 0.7];
				const initialSum = calcSum(initial);
				const initialSumSq = calcSumSquared(initial);
				const n = 3;

				// Update first evaluation from 0.5 to 0.9
				const result = simulateUpdateEvaluation(initialSum, initialSumSq, n, 0.5, 0.9);

				const newEvals = [0.9, 0.6, 0.7];
				const expectedSum = calcSum(newEvals);
				const expectedSumSq = calcSumSquared(newEvals);
				const expected = calcEvaluationDetails(expectedSum, expectedSumSq, n);

				expect(result.mean).toBeCloseTo(expected.mean, 6);
				expect(result.agreement).toBeCloseTo(expected.agreement, 6);
			});

			it('should correctly update agreement when evaluation decreases', () => {
				const initial = [0.5, 0.6, 0.7];
				const initialSum = calcSum(initial);
				const initialSumSq = calcSumSquared(initial);
				const n = 3;

				// Update from 0.7 to 0.2
				const result = simulateUpdateEvaluation(initialSum, initialSumSq, n, 0.7, 0.2);

				const newEvals = [0.5, 0.6, 0.2];
				const expectedSum = calcSum(newEvals);
				const expectedSumSq = calcSumSquared(newEvals);
				const expected = calcEvaluationDetails(expectedSum, expectedSumSq, n);

				expect(result.mean).toBeCloseTo(expected.mean, 6);
				expect(result.agreement).toBeCloseTo(expected.agreement, 6);
			});

			it('should correctly update when changing from positive to negative', () => {
				const initial = [0.8, 0.6, 0.4];
				const initialSum = calcSum(initial);
				const initialSumSq = calcSumSquared(initial);
				const n = 3;

				// Change 0.8 to -0.5
				const result = simulateUpdateEvaluation(initialSum, initialSumSq, n, 0.8, -0.5);

				const newEvals = [-0.5, 0.6, 0.4];
				const expectedSum = calcSum(newEvals);
				const expectedSumSq = calcSumSquared(newEvals);
				const expected = calcEvaluationDetails(expectedSum, expectedSumSq, n);

				expect(result.mean).toBeCloseTo(expected.mean, 6);
				expect(result.agreement).toBeCloseTo(expected.agreement, 6);
			});
		});

		describe('Deleting evaluations', () => {
			it('should correctly update agreement after deleting an evaluation', () => {
				const initial = [0.5, 0.6, 0.7, 0.8];
				const initialSum = calcSum(initial);
				const initialSumSq = calcSumSquared(initial);
				const n = 4;

				// Delete the 0.8 evaluation
				const result = simulateDeleteEvaluation(initialSum, initialSumSq, n, 0.8);

				const remaining = [0.5, 0.6, 0.7];
				const expectedSum = calcSum(remaining);
				const expectedSumSq = calcSumSquared(remaining);
				const expected = calcEvaluationDetails(expectedSum, expectedSumSq, remaining.length);

				expect(result.mean).toBeCloseTo(expected.mean, 6);
				expect(result.agreement).toBeCloseTo(expected.agreement, 6);
			});

			it('should return 0 agreement when last evaluation is deleted', () => {
				const result = simulateDeleteEvaluation(0.5, 0.25, 1, 0.5);

				expect(result.mean).toBe(0);
				expect(result.agreement).toBe(0);
			});
		});

		describe('Complex evaluation sequences', () => {
			it('should maintain consistency through add/update/delete cycle', () => {
				// Start empty
				let sum = 0;
				let sumSq = 0;
				let count = 0;

				// Add 5 evaluations
				const evals = [0.8, 0.6, 0.9, 0.7, 0.5];
				for (const e of evals) {
					sum += e;
					sumSq += e * e;
					count++;
				}

				const afterAdd = calcEvaluationDetails(sum, sumSq, count);
				const expectedAfterAdd = calcEvaluationDetails(
					calcSum(evals),
					calcSumSquared(evals),
					evals.length
				);
				expect(afterAdd.agreement).toBeCloseTo(expectedAfterAdd.agreement, 6);

				// Update evaluation: 0.8 → 0.3
				sum = sum - 0.8 + 0.3;
				sumSq = sumSq - (0.8 * 0.8) + (0.3 * 0.3);

				const afterUpdate = calcEvaluationDetails(sum, sumSq, count);
				const expectedAfterUpdate = calcEvaluationDetails(
					calcSum([0.3, 0.6, 0.9, 0.7, 0.5]),
					calcSumSquared([0.3, 0.6, 0.9, 0.7, 0.5]),
					5
				);
				expect(afterUpdate.agreement).toBeCloseTo(expectedAfterUpdate.agreement, 6);

				// Delete evaluation: remove 0.9
				sum = sum - 0.9;
				sumSq = sumSq - (0.9 * 0.9);
				count--;

				const afterDelete = calcEvaluationDetails(sum, sumSq, count);
				const expectedAfterDelete = calcEvaluationDetails(
					calcSum([0.3, 0.6, 0.7, 0.5]),
					calcSumSquared([0.3, 0.6, 0.7, 0.5]),
					4
				);
				expect(afterDelete.agreement).toBeCloseTo(expectedAfterDelete.agreement, 6);
			});
		});
	});

	describe('Old vs New Formula Comparison', () => {
		it('should fix the Zero Variance Loophole (small unanimous group)', () => {
			// Scenario: 3 people all vote 1.0
			const n = 3;
			const sumEval = 3.0;
			const sumSquared = 3.0;

			const oldScore = calcOldAgreement(sumEval, n);
			const newScore = calcAgreement(sumEval, sumSquared, n);

			// Old formula: 1.0 × √3 ≈ 1.73 (problematic scaling)
			expect(oldScore).toBeCloseTo(Math.sqrt(3), 3);

			// New formula: 1.0 - (0.5/√3) ≈ 0.71 (properly penalized)
			expect(newScore).toBeCloseTo(1.0 - (FLOOR_STD_DEV / Math.sqrt(3)), 3);

			// New formula correctly gives a score less than 1
			expect(newScore).toBeLessThan(1.0);
		});

		it('should be fairer to proposals with different sample sizes', () => {
			// From white paper:
			// Proposal A: 10 evaluators, mean=0.85
			// Proposal B: 100 evaluators, mean=0.80

			const variance = 0.01;

			const nA = 10;
			const meanA = 0.85;
			const sumEvalA = meanA * nA;
			const sumSquaredA = nA * (variance + meanA * meanA);

			const nB = 100;
			const meanB = 0.80;
			const sumEvalB = meanB * nB;
			const sumSquaredB = nB * (variance + meanB * meanB);

			// Old formula unfairly favors B due to larger sample
			const oldScoreA = calcOldAgreement(sumEvalA, nA);
			const oldScoreB = calcOldAgreement(sumEvalB, nB);
			expect(oldScoreB).toBeGreaterThan(oldScoreA); // 8.0 > 2.69

			// New formula: scores are much closer
			const newScoreA = calcAgreement(sumEvalA, sumSquaredA, nA);
			const newScoreB = calcAgreement(sumEvalB, sumSquaredB, nB);

			const scoreDiff = Math.abs(newScoreA - newScoreB);
			expect(scoreDiff).toBeLessThan(0.1); // Much closer than old formula
		});

		it('should correctly rank larger sample with same mean higher', () => {
			const mean = 0.8;
			const variance = 0.01;

			// Different sample sizes, same mean and variance
			const sizes = [10, 50, 100, 500];
			const scores: number[] = [];

			for (const n of sizes) {
				const sumEval = mean * n;
				const sumSquared = n * (variance + mean * mean);
				scores.push(calcAgreement(sumEval, sumSquared, n));
			}

			// Each larger sample should have a higher score (more confidence)
			for (let i = 1; i < scores.length; i++) {
				expect(scores[i]).toBeGreaterThan(scores[i - 1]);
			}

			// All scores should approach the mean as n increases
			expect(scores[scores.length - 1]).toBeLessThan(mean);
			expect(scores[scores.length - 1]).toBeGreaterThan(mean - 0.1);
		});
	});

	describe('Edge Cases and Robustness', () => {
		it('should handle all evaluations being 0', () => {
			const score = calcAgreement(0, 0, 5);

			// Mean = 0, SEM = 0.5/√5 ≈ 0.224
			// availableRange = 0 + 1 = 1
			// penalty = min(0.224, 1) = 0.224
			// agreement = 0 - 0.224 = -0.224
			expect(score).toBeCloseTo(0 - (FLOOR_STD_DEV / Math.sqrt(5)), 3);
		});

		it('should handle all evaluations being -1', () => {
			const n = 10;
			const sumEval = -10;
			const sumSquared = 10; // (-1)² × 10

			const score = calcAgreement(sumEval, sumSquared, n);

			// Mean = -1
			// SEM = 0.5/√10 ≈ 0.158
			// availableRange = -1 + 1 = 0
			// penalty = min(0.158, 0) = 0
			// agreement = -1 - 0 = -1
			expect(score).toBeCloseTo(-1, 6);
		});

		it('should handle very large number of evaluators', () => {
			const n = 1000000;
			const mean = 0.75;
			const sumEval = mean * n;
			const sumSquared = n * mean * mean; // No variance

			const score = calcAgreement(sumEval, sumSquared, n);

			// SEM = 0.5 / √1000000 = 0.0005
			// Score ≈ 0.75 - 0.0005 ≈ 0.7495
			expect(score).toBeCloseTo(mean, 2);
		});

		it('should produce consistent results across order of operations', () => {
			// Order 1: [0.8, 0.6, 0.4]
			const evals1 = [0.8, 0.6, 0.4];
			const score1 = calcAgreement(calcSum(evals1), calcSumSquared(evals1), evals1.length);

			// Order 2: [0.4, 0.8, 0.6]
			const evals2 = [0.4, 0.8, 0.6];
			const score2 = calcAgreement(calcSum(evals2), calcSumSquared(evals2), evals2.length);

			// Should produce identical results
			expect(score1).toBeCloseTo(score2, 10);
		});

		it('should handle duplicated evaluations correctly', () => {
			// Original: [0.8, 0.6, 0.9, 0.7]
			const evals1 = [0.8, 0.6, 0.9, 0.7];
			const score1 = calcAgreement(calcSum(evals1), calcSumSquared(evals1), evals1.length);

			// Duplicated: [0.8, 0.6, 0.9, 0.7, 0.8, 0.6, 0.9, 0.7]
			const evals2 = [...evals1, ...evals1];
			const score2 = calcAgreement(calcSum(evals2), calcSumSquared(evals2), evals2.length);

			// Mean should be the same
			expect(calcSum(evals1) / evals1.length).toBeCloseTo(calcSum(evals2) / evals2.length, 10);

			// Larger sample should have higher score (more confidence)
			expect(score2).toBeGreaterThan(score1);
		});
	});
});
