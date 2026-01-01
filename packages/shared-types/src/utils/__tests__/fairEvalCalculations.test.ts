/**
 * Unit Tests for Fair Evaluation Calculations
 *
 * Tests the core mathematical functions using the worked example from the spec:
 * - 5 users rate +1.0, each has 10 minutes
 * - 2 users rate +0.5, each has 6 minutes
 * - 3 users rate 0 or negative, each has 10 minutes (don't count)
 * - Answer cost = 80 minutes
 *
 * Expected results:
 * - W = 5(1.0) + 2(0.5) = 6.0
 * - T = 5(1.0 × 10) + 2(0.5 × 6) = 56
 * - D = max(0, 80 - 56) = 24
 * - d = 24 / 6.0 = 4 minutes
 */

import {
	getPositiveRating,
	calculateAnswerMetrics,
	calculateUserPayment,
	calculateAllPayments,
	calculateCompleteToGoal,
	verifyPaymentTotal,
	simulateFairAcceptance,
	getAnswerStatus,
	getProgressPercentage,
	UserEvaluationData,
} from '../fairEvalCalculations';

describe('fairEvalCalculations', () => {
	// Test data from spec
	const createTestEvaluations = (): UserEvaluationData[] => [
		// 5 users rate +1.0, each has 10 minutes
		{ userId: 'user1', evaluation: 1.0, walletBalance: 10 },
		{ userId: 'user2', evaluation: 1.0, walletBalance: 10 },
		{ userId: 'user3', evaluation: 1.0, walletBalance: 10 },
		{ userId: 'user4', evaluation: 1.0, walletBalance: 10 },
		{ userId: 'user5', evaluation: 1.0, walletBalance: 10 },
		// 2 users rate +0.5, each has 6 minutes
		{ userId: 'user6', evaluation: 0.5, walletBalance: 6 },
		{ userId: 'user7', evaluation: 0.5, walletBalance: 6 },
		// 3 users with no positive rating
		{ userId: 'user8', evaluation: 0, walletBalance: 10 },
		{ userId: 'user9', evaluation: -0.5, walletBalance: 10 },
		{ userId: 'user10', evaluation: -1.0, walletBalance: 10 },
	];

	const ANSWER_COST = 80;

	describe('getPositiveRating', () => {
		it('should return 0 for negative evaluations', () => {
			expect(getPositiveRating(-1)).toBe(0);
			expect(getPositiveRating(-0.5)).toBe(0);
			expect(getPositiveRating(-0.1)).toBe(0);
		});

		it('should return 0 for zero evaluation', () => {
			expect(getPositiveRating(0)).toBe(0);
		});

		it('should return the value for positive evaluations', () => {
			expect(getPositiveRating(1)).toBe(1);
			expect(getPositiveRating(0.5)).toBe(0.5);
			expect(getPositiveRating(0.1)).toBe(0.1);
		});

		it('should handle edge cases', () => {
			expect(getPositiveRating(0.001)).toBeCloseTo(0.001);
			expect(getPositiveRating(-0.001)).toBe(0);
		});
	});

	describe('calculateAnswerMetrics', () => {
		it('should calculate correct metrics for spec example', () => {
			const evaluations = createTestEvaluations();
			const metrics = calculateAnswerMetrics(ANSWER_COST, evaluations);

			// W = 5(1.0) + 2(0.5) = 6.0
			expect(metrics.weightedSupporters).toBe(6.0);

			// T = 5(1.0 × 10) + 2(0.5 × 6) = 50 + 6 = 56
			expect(metrics.totalContribution).toBe(56);

			// D = max(0, 80 - 56) = 24
			expect(metrics.distanceToGoal).toBe(24);

			// d = 24 / 6.0 = 4
			expect(metrics.distancePerSupporter).toBe(4);
		});

		it('should return Infinity for distancePerSupporter when no supporters', () => {
			const evaluations: UserEvaluationData[] = [
				{ userId: 'user1', evaluation: 0, walletBalance: 10 },
				{ userId: 'user2', evaluation: -1, walletBalance: 10 },
			];
			const metrics = calculateAnswerMetrics(100, evaluations);

			expect(metrics.weightedSupporters).toBe(0);
			expect(metrics.distancePerSupporter).toBe(Infinity);
		});

		it('should return 0 distance when goal is reached', () => {
			const evaluations: UserEvaluationData[] = [
				{ userId: 'user1', evaluation: 1.0, walletBalance: 100 },
			];
			const metrics = calculateAnswerMetrics(50, evaluations);

			expect(metrics.distanceToGoal).toBe(0);
			expect(metrics.distancePerSupporter).toBe(0);
		});

		it('should handle empty evaluations', () => {
			const metrics = calculateAnswerMetrics(100, []);

			expect(metrics.weightedSupporters).toBe(0);
			expect(metrics.totalContribution).toBe(0);
			expect(metrics.distanceToGoal).toBe(100);
			expect(metrics.distancePerSupporter).toBe(Infinity);
		});
	});

	describe('calculateUserPayment', () => {
		it('should calculate correct payment for full supporter', () => {
			// From spec: Each +1.0 supporter pays: (80/56) × 10 × 1.0 ≈ 14.29 min
			const payment = calculateUserPayment(80, 56, 10, 1.0);
			expect(payment).toBeCloseTo(14.29, 2);
		});

		it('should calculate correct payment for partial supporter', () => {
			// From spec: Each +0.5 supporter pays: (80/56) × 6 × 0.5 ≈ 4.29 min
			const payment = calculateUserPayment(80, 56, 6, 0.5);
			expect(payment).toBeCloseTo(4.29, 2);
		});

		it('should return 0 for non-supporters', () => {
			expect(calculateUserPayment(80, 56, 10, 0)).toBe(0);
			expect(calculateUserPayment(80, 56, 10, -0.5)).toBe(0);
		});

		it('should return 0 when totalContribution is 0', () => {
			expect(calculateUserPayment(80, 0, 10, 1.0)).toBe(0);
		});
	});

	describe('calculateAllPayments', () => {
		it('should calculate payments for all supporters', () => {
			const evaluations = createTestEvaluations();
			const payments = calculateAllPayments(ANSWER_COST, evaluations);

			// Should have 7 supporters (5 full + 2 partial)
			expect(payments.length).toBe(7);

			// Check that non-supporters are not included
			const userIds = payments.map(p => p.userId);
			expect(userIds).not.toContain('user8');
			expect(userIds).not.toContain('user9');
			expect(userIds).not.toContain('user10');
		});

		it('should have payments summing to answer cost', () => {
			const evaluations = createTestEvaluations();
			const payments = calculateAllPayments(ANSWER_COST, evaluations);

			expect(verifyPaymentTotal(payments, ANSWER_COST)).toBe(true);
		});
	});

	describe('verifyPaymentTotal', () => {
		it('should return true when payments equal cost', () => {
			const payments = [
				{ userId: 'u1', positiveRating: 1, walletBalance: 10, payment: 50 },
				{ userId: 'u2', positiveRating: 1, walletBalance: 10, payment: 30 },
			];
			expect(verifyPaymentTotal(payments, 80)).toBe(true);
		});

		it('should return false when payments do not equal cost', () => {
			const payments = [
				{ userId: 'u1', positiveRating: 1, walletBalance: 10, payment: 50 },
			];
			expect(verifyPaymentTotal(payments, 80)).toBe(false);
		});

		it('should respect tolerance', () => {
			const payments = [
				{ userId: 'u1', positiveRating: 1, walletBalance: 10, payment: 79.995 },
			];
			expect(verifyPaymentTotal(payments, 80, 0.01)).toBe(true);
			expect(verifyPaymentTotal(payments, 80, 0.001)).toBe(false);
		});
	});

	describe('calculateCompleteToGoal', () => {
		it('should calculate correct minutes needed', () => {
			// From spec: d = 4, N = 10, Y = 40
			const result = calculateCompleteToGoal(4, 10);
			expect(result.perUser).toBe(4);
			expect(result.total).toBe(40);
		});

		it('should return 0 when already at goal', () => {
			const result = calculateCompleteToGoal(0, 10);
			expect(result.perUser).toBe(0);
			expect(result.total).toBe(0);
		});

		it('should return 0 when distancePerSupporter is Infinity', () => {
			const result = calculateCompleteToGoal(Infinity, 10);
			expect(result.perUser).toBe(0);
			expect(result.total).toBe(0);
		});

		it('should return 0 for negative distance', () => {
			const result = calculateCompleteToGoal(-5, 10);
			expect(result.perUser).toBe(0);
			expect(result.total).toBe(0);
		});
	});

	describe('getAnswerStatus', () => {
		it('should return "reached" when distance is 0', () => {
			const metrics = { weightedSupporters: 5, totalContribution: 100, distanceToGoal: 0, distancePerSupporter: 0 };
			expect(getAnswerStatus(metrics)).toBe('reached');
		});

		it('should return "hasSupport" when has supporters but not at goal', () => {
			const metrics = { weightedSupporters: 5, totalContribution: 50, distanceToGoal: 50, distancePerSupporter: 10 };
			expect(getAnswerStatus(metrics)).toBe('hasSupport');
		});

		it('should return "noSupport" when no supporters', () => {
			const metrics = { weightedSupporters: 0, totalContribution: 0, distanceToGoal: 100, distancePerSupporter: Infinity };
			expect(getAnswerStatus(metrics)).toBe('noSupport');
		});
	});

	describe('getProgressPercentage', () => {
		it('should return correct percentage', () => {
			expect(getProgressPercentage(50, 100)).toBe(50);
			expect(getProgressPercentage(25, 100)).toBe(25);
			expect(getProgressPercentage(100, 100)).toBe(100);
		});

		it('should cap at 100%', () => {
			expect(getProgressPercentage(150, 100)).toBe(100);
		});

		it('should return 100% for zero cost', () => {
			expect(getProgressPercentage(50, 0)).toBe(100);
		});

		it('should return 0% for zero contribution', () => {
			expect(getProgressPercentage(0, 100)).toBe(0);
		});
	});

	describe('simulateFairAcceptance', () => {
		it('should accept answer at goal first', () => {
			const answers = [
				{
					statementId: 'answer1',
					cost: 50,
					evaluations: [{ userId: 'u1', evaluation: 1.0, walletBalance: 100 }],
				},
				{
					statementId: 'answer2',
					cost: 100,
					evaluations: [{ userId: 'u1', evaluation: 1.0, walletBalance: 100 }],
				},
			];
			const balances = new Map([['u1', 100]]);

			const result = simulateFairAcceptance(answers, balances, 5);

			// answer1 is at goal (T=100 >= C=50), should be accepted first
			expect(result[0]).toBe('answer1');
		});

		it('should prefer higher contribution when multiple at goal', () => {
			const answers = [
				{
					statementId: 'low',
					cost: 50,
					evaluations: [{ userId: 'u1', evaluation: 0.5, walletBalance: 100 }],
				},
				{
					statementId: 'high',
					cost: 50,
					evaluations: [{ userId: 'u1', evaluation: 1.0, walletBalance: 100 }],
				},
			];
			const balances = new Map([['u1', 100]]);

			const result = simulateFairAcceptance(answers, balances, 5);

			// 'high' has T=100, 'low' has T=50, 'high' should win
			expect(result[0]).toBe('high');
		});

		it('should return empty array when no answers can be accepted', () => {
			const answers = [
				{
					statementId: 'answer1',
					cost: 1000,
					evaluations: [{ userId: 'u1', evaluation: 0, walletBalance: 10 }],
				},
			];
			const balances = new Map([['u1', 10]]);

			const result = simulateFairAcceptance(answers, balances, 5);

			expect(result.length).toBe(0);
		});

		it('should deduct payments and recalculate after acceptance', () => {
			// Two answers sharing the same supporters
			const answers = [
				{
					statementId: 'answer1',
					cost: 50,
					evaluations: [{ userId: 'u1', evaluation: 1.0, walletBalance: 100 }],
				},
				{
					statementId: 'answer2',
					cost: 50,
					evaluations: [{ userId: 'u1', evaluation: 1.0, walletBalance: 100 }],
				},
			];
			const balances = new Map([['u1', 100]]);

			const result = simulateFairAcceptance(answers, balances, 5);

			// Both should be accepted (100 - 50 = 50, then 50 - 50 = 0)
			expect(result.length).toBe(2);
		});
	});

	describe('Complete Flow Test (from spec)', () => {
		it('should handle the full example from specification', () => {
			const evaluations = createTestEvaluations();
			const metrics = calculateAnswerMetrics(ANSWER_COST, evaluations);

			// Step 1: Verify initial metrics
			expect(metrics.weightedSupporters).toBe(6.0);
			expect(metrics.totalContribution).toBe(56);
			expect(metrics.distanceToGoal).toBe(24);
			expect(metrics.distancePerSupporter).toBe(4);

			// Step 2: Calculate minutes needed to complete
			const completeToGoal = calculateCompleteToGoal(metrics.distancePerSupporter, 10);
			expect(completeToGoal.perUser).toBe(4);
			expect(completeToGoal.total).toBe(40);

			// Step 3: Simulate adding 4 minutes to each user
			const updatedEvaluations = evaluations.map(e => ({
				...e,
				walletBalance: e.walletBalance + 4,
			}));

			const newMetrics = calculateAnswerMetrics(ANSWER_COST, updatedEvaluations);

			// New T = 5(1.0 × 14) + 2(0.5 × 10) = 70 + 10 = 80
			expect(newMetrics.totalContribution).toBe(80);
			expect(newMetrics.distanceToGoal).toBe(0);

			// Step 4: Verify payments
			const payments = calculateAllPayments(ANSWER_COST, updatedEvaluations);
			expect(verifyPaymentTotal(payments, ANSWER_COST)).toBe(true);
		});
	});
});
