/**
 * Integration Tests for Mean-SEM Evaluation Algorithm
 *
 * These tests simulate real-world evaluation scenarios by tracking
 * the complete lifecycle of evaluations on a statement.
 *
 * The tests verify that:
 * 1. Agreement scores are calculated correctly after each operation
 * 2. The algorithm behaves consistently with the mathematical expectations
 * 3. Edge cases are handled properly in realistic scenarios
 */

import {
	FLOOR_STD_DEV,
	calcAgreement,
	calcSquaredDiff,
	calcSumSquared,
	calcSum,
} from '../evaluationAlgorithm';

/**
 * Simulates the StatementEvaluation object stored in Firestore
 */
interface MockStatementEvaluation {
	sumEvaluations: number;
	sumSquaredEvaluations: number;
	numberOfEvaluators: number;
	agreement: number;
	averageEvaluation: number;
	sumPro: number;
	sumCon: number;
	numberOfProEvaluators: number;
	numberOfConEvaluators: number;
}

/**
 * Simulates an individual evaluation document
 */
interface MockEvaluation {
	odeFvaluationId: string;
	odeFvaluatorId: string;
	evaluation: number;
	statementId: string;
}

/**
 * EvaluationTracker - Simulates the Firestore evaluation system
 *
 * This class mimics how evaluations are stored and aggregated in the real system,
 * allowing us to test the algorithm in realistic scenarios.
 */
class EvaluationTracker {
	private statementEval: MockStatementEvaluation;
	private evaluations: Map<string, MockEvaluation> = new Map();

	constructor() {
		this.statementEval = {
			sumEvaluations: 0,
			sumSquaredEvaluations: 0,
			numberOfEvaluators: 0,
			agreement: 0,
			averageEvaluation: 0,
			sumPro: 0,
			sumCon: 0,
			numberOfProEvaluators: 0,
			numberOfConEvaluators: 0,
		};
	}

	/**
	 * Add a new evaluation (simulates fn_evaluation.newEvaluation)
	 */
	addEvaluation(userId: string, value: number): MockStatementEvaluation {
		if (this.evaluations.has(userId)) {
			throw new Error(`User ${userId} already has an evaluation. Use updateEvaluation instead.`);
		}

		const evaluation: MockEvaluation = {
			odeFvaluationId: `eval_${userId}`,
			odeFvaluatorId: userId,
			evaluation: value,
			statementId: 'test_statement',
		};

		this.evaluations.set(userId, evaluation);

		// Update aggregates (mimics calculateEvaluation in fn_evaluation.ts)
		this.statementEval.sumEvaluations += value;
		this.statementEval.sumSquaredEvaluations += value * value;
		this.statementEval.numberOfEvaluators += 1;

		// Update pro/con
		if (value > 0) {
			this.statementEval.sumPro += value;
			this.statementEval.numberOfProEvaluators += 1;
		} else if (value < 0) {
			this.statementEval.sumCon += Math.abs(value);
			this.statementEval.numberOfConEvaluators += 1;
		}

		// Recalculate agreement
		this.recalculateAgreement();

		return { ...this.statementEval };
	}

	/**
	 * Update an existing evaluation (simulates fn_evaluation.updateEvaluation)
	 */
	updateEvaluation(userId: string, newValue: number): MockStatementEvaluation {
		const existing = this.evaluations.get(userId);
		if (!existing) {
			throw new Error(`User ${userId} has no evaluation to update. Use addEvaluation instead.`);
		}

		const oldValue = existing.evaluation;

		// Update evaluation
		existing.evaluation = newValue;

		// Update aggregates
		this.statementEval.sumEvaluations += (newValue - oldValue);
		this.statementEval.sumSquaredEvaluations += calcSquaredDiff(newValue, oldValue);

		// Update pro/con counts
		if (oldValue > 0 && newValue <= 0) {
			this.statementEval.numberOfProEvaluators -= 1;
		}
		if (oldValue <= 0 && newValue > 0) {
			this.statementEval.numberOfProEvaluators += 1;
		}
		if (oldValue < 0 && newValue >= 0) {
			this.statementEval.numberOfConEvaluators -= 1;
		}
		if (oldValue >= 0 && newValue < 0) {
			this.statementEval.numberOfConEvaluators += 1;
		}

		// Update pro/con sums
		this.statementEval.sumPro += Math.max(newValue, 0) - Math.max(oldValue, 0);
		this.statementEval.sumCon += Math.max(-newValue, 0) - Math.max(-oldValue, 0);

		// Recalculate agreement
		this.recalculateAgreement();

		return { ...this.statementEval };
	}

	/**
	 * Delete an evaluation (simulates fn_evaluation.deleteEvaluation)
	 */
	deleteEvaluation(userId: string): MockStatementEvaluation {
		const existing = this.evaluations.get(userId);
		if (!existing) {
			throw new Error(`User ${userId} has no evaluation to delete.`);
		}

		const value = existing.evaluation;

		// Remove from map
		this.evaluations.delete(userId);

		// Update aggregates
		this.statementEval.sumEvaluations -= value;
		this.statementEval.sumSquaredEvaluations -= value * value;
		this.statementEval.numberOfEvaluators -= 1;

		// Update pro/con
		if (value > 0) {
			this.statementEval.sumPro -= value;
			this.statementEval.numberOfProEvaluators -= 1;
		} else if (value < 0) {
			this.statementEval.sumCon -= Math.abs(value);
			this.statementEval.numberOfConEvaluators -= 1;
		}

		// Ensure non-negative values
		this.statementEval.sumSquaredEvaluations = Math.max(0, this.statementEval.sumSquaredEvaluations);
		this.statementEval.numberOfProEvaluators = Math.max(0, this.statementEval.numberOfProEvaluators);
		this.statementEval.numberOfConEvaluators = Math.max(0, this.statementEval.numberOfConEvaluators);

		// Recalculate agreement
		this.recalculateAgreement();

		return { ...this.statementEval };
	}

	/**
	 * Recalculate the agreement score using the Mean-SEM algorithm
	 */
	private recalculateAgreement(): void {
		const { sumEvaluations, sumSquaredEvaluations, numberOfEvaluators } = this.statementEval;

		this.statementEval.agreement = calcAgreement(
			sumEvaluations,
			sumSquaredEvaluations,
			numberOfEvaluators
		);

		this.statementEval.averageEvaluation = numberOfEvaluators > 0
			? sumEvaluations / numberOfEvaluators
			: 0;
	}

	/**
	 * Get the current state (for assertions)
	 */
	getState(): MockStatementEvaluation {
		return { ...this.statementEval };
	}

	/**
	 * Get all evaluations (for verification)
	 */
	getAllEvaluations(): number[] {
		return Array.from(this.evaluations.values()).map(e => e.evaluation);
	}

	/**
	 * Verify consistency between individual evaluations and aggregates
	 */
	verifyConsistency(): { isConsistent: boolean; discrepancies: string[] } {
		const discrepancies: string[] = [];
		const evals = this.getAllEvaluations();

		// Check sum
		const expectedSum = calcSum(evals);
		if (Math.abs(this.statementEval.sumEvaluations - expectedSum) > 0.0001) {
			discrepancies.push(
				`sumEvaluations mismatch: expected ${expectedSum}, got ${this.statementEval.sumEvaluations}`
			);
		}

		// Check sum squared
		const expectedSumSquared = calcSumSquared(evals);
		if (Math.abs(this.statementEval.sumSquaredEvaluations - expectedSumSquared) > 0.0001) {
			discrepancies.push(
				`sumSquaredEvaluations mismatch: expected ${expectedSumSquared}, got ${this.statementEval.sumSquaredEvaluations}`
			);
		}

		// Check count
		if (this.statementEval.numberOfEvaluators !== evals.length) {
			discrepancies.push(
				`numberOfEvaluators mismatch: expected ${evals.length}, got ${this.statementEval.numberOfEvaluators}`
			);
		}

		// Check agreement
		const expectedAgreement = calcAgreement(expectedSum, expectedSumSquared, evals.length);
		if (Math.abs(this.statementEval.agreement - expectedAgreement) > 0.0001) {
			discrepancies.push(
				`agreement mismatch: expected ${expectedAgreement}, got ${this.statementEval.agreement}`
			);
		}

		return {
			isConsistent: discrepancies.length === 0,
			discrepancies,
		};
	}
}

describe('Evaluation Algorithm Integration Tests', () => {
	describe('Basic Evaluation Lifecycle', () => {
		it('should correctly track a single evaluation', () => {
			const tracker = new EvaluationTracker();

			const result = tracker.addEvaluation('user1', 0.8);

			expect(result.numberOfEvaluators).toBe(1);
			expect(result.sumEvaluations).toBeCloseTo(0.8, 6);
			expect(result.sumSquaredEvaluations).toBeCloseTo(0.64, 6);
			// n=1: agreement = 0.8 - 0.5 = 0.3
			expect(result.agreement).toBeCloseTo(0.3, 4);

			const consistency = tracker.verifyConsistency();
			expect(consistency.isConsistent).toBe(true);
		});

		it('should correctly track multiple evaluations', () => {
			const tracker = new EvaluationTracker();

			tracker.addEvaluation('user1', 0.8);
			tracker.addEvaluation('user2', 0.6);
			const result = tracker.addEvaluation('user3', 0.9);

			expect(result.numberOfEvaluators).toBe(3);
			expect(result.sumEvaluations).toBeCloseTo(2.3, 6);
			expect(result.averageEvaluation).toBeCloseTo(2.3 / 3, 6);

			const consistency = tracker.verifyConsistency();
			expect(consistency.isConsistent).toBe(true);
		});

		it('should correctly update an evaluation', () => {
			const tracker = new EvaluationTracker();

			tracker.addEvaluation('user1', 0.5);
			tracker.addEvaluation('user2', 0.7);

			// Update user1's evaluation from 0.5 to 0.9
			const result = tracker.updateEvaluation('user1', 0.9);

			expect(result.numberOfEvaluators).toBe(2);
			expect(result.sumEvaluations).toBeCloseTo(1.6, 6); // 0.9 + 0.7

			const consistency = tracker.verifyConsistency();
			expect(consistency.isConsistent).toBe(true);
		});

		it('should correctly delete an evaluation', () => {
			const tracker = new EvaluationTracker();

			tracker.addEvaluation('user1', 0.8);
			tracker.addEvaluation('user2', 0.6);
			tracker.addEvaluation('user3', 0.4);

			// Delete user2's evaluation
			const result = tracker.deleteEvaluation('user2');

			expect(result.numberOfEvaluators).toBe(2);
			expect(result.sumEvaluations).toBeCloseTo(1.2, 6); // 0.8 + 0.4

			const consistency = tracker.verifyConsistency();
			expect(consistency.isConsistent).toBe(true);
		});
	});

	describe('Complex Evaluation Scenarios', () => {
		it('should handle a full lifecycle: add, update, delete', () => {
			const tracker = new EvaluationTracker();

			// Add 5 users
			tracker.addEvaluation('user1', 0.8);
			tracker.addEvaluation('user2', 0.6);
			tracker.addEvaluation('user3', 0.9);
			tracker.addEvaluation('user4', 0.7);
			tracker.addEvaluation('user5', 0.5);

			let state = tracker.getState();
			expect(state.numberOfEvaluators).toBe(5);

			// Update 2 users
			tracker.updateEvaluation('user1', 0.3); // Decrease
			tracker.updateEvaluation('user3', 1.0); // Increase

			state = tracker.getState();
			expect(state.numberOfEvaluators).toBe(5); // Still 5

			// Delete 2 users
			tracker.deleteEvaluation('user2');
			tracker.deleteEvaluation('user4');

			state = tracker.getState();
			expect(state.numberOfEvaluators).toBe(3);

			// Add 1 new user
			tracker.addEvaluation('user6', 0.85);

			state = tracker.getState();
			expect(state.numberOfEvaluators).toBe(4);

			// Verify final consistency
			const consistency = tracker.verifyConsistency();
			expect(consistency.isConsistent).toBe(true);
		});

		it('should handle mixed positive and negative evaluations', () => {
			const tracker = new EvaluationTracker();

			tracker.addEvaluation('supporter1', 0.9);
			tracker.addEvaluation('supporter2', 0.7);
			tracker.addEvaluation('opponent1', -0.5);
			tracker.addEvaluation('opponent2', -0.8);
			tracker.addEvaluation('neutral', 0.1);

			const state = tracker.getState();

			expect(state.numberOfProEvaluators).toBe(3); // 0.9, 0.7, 0.1
			expect(state.numberOfConEvaluators).toBe(2); // -0.5, -0.8

			const consistency = tracker.verifyConsistency();
			expect(consistency.isConsistent).toBe(true);
		});

		it('should handle evaluation sign changes', () => {
			const tracker = new EvaluationTracker();

			tracker.addEvaluation('user1', 0.8); // Positive

			let state = tracker.getState();
			expect(state.numberOfProEvaluators).toBe(1);
			expect(state.numberOfConEvaluators).toBe(0);

			// Change from positive to negative
			tracker.updateEvaluation('user1', -0.6);

			state = tracker.getState();
			expect(state.numberOfProEvaluators).toBe(0);
			expect(state.numberOfConEvaluators).toBe(1);

			// Change back to positive
			tracker.updateEvaluation('user1', 0.5);

			state = tracker.getState();
			expect(state.numberOfProEvaluators).toBe(1);
			expect(state.numberOfConEvaluators).toBe(0);

			const consistency = tracker.verifyConsistency();
			expect(consistency.isConsistent).toBe(true);
		});
	});

	describe('Confidence Growth', () => {
		it('should show increasing agreement as evaluators grow (same mean)', () => {
			const tracker = new EvaluationTracker();
			const agreements: number[] = [];

			// Add 20 evaluators all voting 0.8
			for (let i = 0; i < 20; i++) {
				tracker.addEvaluation(`user${i}`, 0.8);
				agreements.push(tracker.getState().agreement);
			}

			// Each additional evaluator should increase agreement
			for (let i = 1; i < agreements.length; i++) {
				expect(agreements[i]).toBeGreaterThan(agreements[i - 1]);
			}

			// Final agreement should be close to 0.8 but less than it
			expect(agreements[agreements.length - 1]).toBeLessThan(0.8);
			expect(agreements[agreements.length - 1]).toBeGreaterThan(0.6);
		});

		it('should approach mean as n approaches infinity', () => {
			const tracker = new EvaluationTracker();
			const targetMean = 0.75;

			// Add many evaluators
			for (let i = 0; i < 1000; i++) {
				tracker.addEvaluation(`user${i}`, targetMean);
			}

			const state = tracker.getState();

			// With n=1000, SEM = 0.5/√1000 ≈ 0.0158
			// Agreement ≈ 0.75 - 0.0158 ≈ 0.734
			expect(state.agreement).toBeGreaterThan(0.7);
			expect(state.agreement).toBeLessThan(targetMean);
			expect(Math.abs(state.agreement - targetMean)).toBeLessThan(0.05);
		});
	});

	describe('Zero Variance Loophole Prevention', () => {
		it('should penalize small unanimous positive groups', () => {
			const tracker = new EvaluationTracker();

			// 3 people all vote 1.0
			tracker.addEvaluation('user1', 1.0);
			tracker.addEvaluation('user2', 1.0);
			tracker.addEvaluation('user3', 1.0);

			const state = tracker.getState();

			// Without floor: agreement = 1.0
			// With floor: agreement = 1.0 - (0.5/√3) ≈ 0.71
			expect(state.agreement).toBeCloseTo(1.0 - (FLOOR_STD_DEV / Math.sqrt(3)), 3);
			expect(state.agreement).toBeLessThan(1.0);
		});

		it('should allow large groups with variance to score higher', () => {
			// Small unanimous group
			const smallTracker = new EvaluationTracker();
			for (let i = 0; i < 3; i++) {
				smallTracker.addEvaluation(`small${i}`, 1.0);
			}

			// Large group with same mean but natural variance
			const largeTracker = new EvaluationTracker();
			const largeEvaluations = [
				0.95, 0.98, 1.0, 0.92, 0.97, 0.99, 0.94, 0.96, 0.93, 0.98,
				0.97, 0.95, 0.99, 0.94, 0.96, 0.98, 0.95, 0.97, 0.93, 0.99,
			];
			for (let i = 0; i < largeEvaluations.length; i++) {
				largeTracker.addEvaluation(`large${i}`, largeEvaluations[i]);
			}

			const smallState = smallTracker.getState();
			const largeState = largeTracker.getState();

			// Large group should score higher despite slightly lower mean
			// because of higher confidence (more evaluators)
			expect(largeState.agreement).toBeGreaterThan(smallState.agreement);
		});
	});

	describe('Edge Cases', () => {
		it('should handle deleting all evaluations', () => {
			const tracker = new EvaluationTracker();

			tracker.addEvaluation('user1', 0.8);
			tracker.addEvaluation('user2', 0.6);

			tracker.deleteEvaluation('user1');
			tracker.deleteEvaluation('user2');

			const state = tracker.getState();

			expect(state.numberOfEvaluators).toBe(0);
			expect(state.agreement).toBe(0);
			expect(state.averageEvaluation).toBe(0);
		});

		it('should handle extreme values', () => {
			const tracker = new EvaluationTracker();

			tracker.addEvaluation('max', 1.0);
			tracker.addEvaluation('min', -1.0);

			const state = tracker.getState();

			expect(state.sumEvaluations).toBe(0);
			expect(state.averageEvaluation).toBe(0);
			expect(state.agreement).toBeLessThan(0); // Penalized for high variance

			const consistency = tracker.verifyConsistency();
			expect(consistency.isConsistent).toBe(true);
		});

		it('should handle rapid successive updates', () => {
			const tracker = new EvaluationTracker();

			tracker.addEvaluation('user1', 0.5);

			// Rapid updates
			for (let i = 0; i < 10; i++) {
				const newValue = Math.sin(i) * 0.5 + 0.5; // Oscillating value
				tracker.updateEvaluation('user1', newValue);
			}

			const consistency = tracker.verifyConsistency();
			expect(consistency.isConsistent).toBe(true);
		});
	});

	describe('Realistic Voting Scenarios', () => {
		it('should handle a controversial topic (split votes)', () => {
			const tracker = new EvaluationTracker();

			// 50% positive, 50% negative
			for (let i = 0; i < 50; i++) {
				tracker.addEvaluation(`pro${i}`, 0.7 + Math.random() * 0.3);
			}
			for (let i = 0; i < 50; i++) {
				tracker.addEvaluation(`con${i}`, -(0.7 + Math.random() * 0.3));
			}

			const state = tracker.getState();

			// Should be close to 0 (controversial)
			expect(Math.abs(state.averageEvaluation)).toBeLessThan(0.2);
			// Agreement should be negative (high uncertainty + controversial)
			expect(state.agreement).toBeLessThan(0);

			const consistency = tracker.verifyConsistency();
			expect(consistency.isConsistent).toBe(true);
		});

		it('should handle a popular proposal (mostly positive)', () => {
			const tracker = new EvaluationTracker();

			// 90% positive with some variation
			for (let i = 0; i < 90; i++) {
				tracker.addEvaluation(`supporter${i}`, 0.6 + Math.random() * 0.4);
			}
			// 10% negative
			for (let i = 0; i < 10; i++) {
				tracker.addEvaluation(`opponent${i}`, -(0.3 + Math.random() * 0.5));
			}

			const state = tracker.getState();

			// Should be positive
			expect(state.averageEvaluation).toBeGreaterThan(0.4);
			expect(state.agreement).toBeGreaterThan(0.3);

			const consistency = tracker.verifyConsistency();
			expect(consistency.isConsistent).toBe(true);
		});

		it('should handle an unpopular proposal (mostly negative)', () => {
			const tracker = new EvaluationTracker();

			// 80% negative
			for (let i = 0; i < 80; i++) {
				tracker.addEvaluation(`opponent${i}`, -(0.5 + Math.random() * 0.5));
			}
			// 20% positive
			for (let i = 0; i < 20; i++) {
				tracker.addEvaluation(`supporter${i}`, 0.3 + Math.random() * 0.4);
			}

			const state = tracker.getState();

			// Should be negative
			expect(state.averageEvaluation).toBeLessThan(-0.2);
			expect(state.agreement).toBeLessThan(-0.2);

			const consistency = tracker.verifyConsistency();
			expect(consistency.isConsistent).toBe(true);
		});
	});

	describe('Deterministic Verification', () => {
		it('should produce consistent results for the same inputs', () => {
			// Run the same scenario twice
			const runScenario = (): MockStatementEvaluation => {
				const tracker = new EvaluationTracker();

				tracker.addEvaluation('a', 0.8);
				tracker.addEvaluation('b', 0.6);
				tracker.addEvaluation('c', 0.9);
				tracker.updateEvaluation('b', 0.7);
				tracker.deleteEvaluation('a');
				tracker.addEvaluation('d', 0.5);

				return tracker.getState();
			};

			const result1 = runScenario();
			const result2 = runScenario();

			expect(result1.agreement).toBeCloseTo(result2.agreement, 10);
			expect(result1.sumEvaluations).toBeCloseTo(result2.sumEvaluations, 10);
			expect(result1.numberOfEvaluators).toBe(result2.numberOfEvaluators);
		});

		it('should match direct calculation', () => {
			const tracker = new EvaluationTracker();

			const evaluations = [0.8, 0.6, 0.9, 0.7, 0.5];
			for (let i = 0; i < evaluations.length; i++) {
				tracker.addEvaluation(`user${i}`, evaluations[i]);
			}

			const state = tracker.getState();

			// Direct calculation
			const directSum = calcSum(evaluations);
			const directSumSq = calcSumSquared(evaluations);
			const directAgreement = calcAgreement(directSum, directSumSq, evaluations.length);

			expect(state.sumEvaluations).toBeCloseTo(directSum, 10);
			expect(state.sumSquaredEvaluations).toBeCloseTo(directSumSq, 10);
			expect(state.agreement).toBeCloseTo(directAgreement, 10);
		});
	});
});
