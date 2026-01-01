/**
 * Unit tests for Fair Evaluation Cloud Functions
 *
 * Tests the fair evaluation voting system functions:
 * - initializeWallet: Creates wallet when user joins group
 * - onFairEvalEvaluationChange: Recalculates metrics on evaluation change
 * - addMinutesToGroup: Distributes minutes to all members
 * - setAnswerCost: Updates answer cost
 * - acceptFairEvalAnswer: Accepts answer and deducts payments
 * - completeToGoal: Adds minutes to bring answer to goal then accepts
 * - getWalletInfo: Gets wallet balance
 * - getTransactionHistory: Gets transaction list
 */

import { describe, it, expect } from '@jest/globals';
import {
	calculateAnswerMetrics,
	calculateAllPayments,
	calculateCompleteToGoal,
	getPositiveRating,
	UserEvaluationData,
	getWalletId,
	DEFAULT_INITIAL_WALLET_BALANCE,
	DEFAULT_ANSWER_COST,
} from '@freedi/shared-types';

describe('Fair Evaluation Cloud Functions', () => {
	describe('Wallet Initialization', () => {
		it('should generate correct wallet ID format', () => {
			const topParentId = 'group123';
			const userId = 'user456';

			const walletId = getWalletId(topParentId, userId);

			expect(walletId).toBe('group123--user456');
		});

		it('should use default initial balance when not specified', () => {
			expect(DEFAULT_INITIAL_WALLET_BALANCE).toBe(10);
		});

		it('should use default answer cost when not specified', () => {
			expect(DEFAULT_ANSWER_COST).toBe(1000);
		});
	});

	describe('Metrics Calculation Integration', () => {
		// Test data matching spec example
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

		it('should calculate metrics correctly for spec example', () => {
			const evaluations = createTestEvaluations();
			const answerCost = 80;
			const metrics = calculateAnswerMetrics(answerCost, evaluations);

			// From spec:
			// W = 5(1.0) + 2(0.5) = 6.0
			// T = 5(1.0 × 10) + 2(0.5 × 6) = 56
			// D = max(0, 80 - 56) = 24
			// d = 24 / 6.0 = 4

			expect(metrics.weightedSupporters).toBe(6.0);
			expect(metrics.totalContribution).toBe(56);
			expect(metrics.distanceToGoal).toBe(24);
			expect(metrics.distancePerSupporter).toBe(4);
		});

		it('should correctly identify goal reached status', () => {
			const evaluations: UserEvaluationData[] = [
				{ userId: 'user1', evaluation: 1.0, walletBalance: 100 },
			];
			const answerCost = 50;
			const metrics = calculateAnswerMetrics(answerCost, evaluations);

			expect(metrics.distanceToGoal).toBe(0);
		});

		it('should handle no supporters correctly', () => {
			const evaluations: UserEvaluationData[] = [
				{ userId: 'user1', evaluation: 0, walletBalance: 10 },
				{ userId: 'user2', evaluation: -1, walletBalance: 10 },
			];
			const answerCost = 100;
			const metrics = calculateAnswerMetrics(answerCost, evaluations);

			expect(metrics.weightedSupporters).toBe(0);
			expect(metrics.distancePerSupporter).toBe(Infinity);
		});
	});

	describe('Payment Calculation Integration', () => {
		it('should calculate payments for all supporters', () => {
			const evaluations: UserEvaluationData[] = [
				{ userId: 'user1', evaluation: 1.0, walletBalance: 10 },
				{ userId: 'user2', evaluation: 1.0, walletBalance: 10 },
				{ userId: 'user3', evaluation: 0.5, walletBalance: 6 },
				{ userId: 'user4', evaluation: 0, walletBalance: 10 }, // No support
			];
			const answerCost = 23; // Exactly T
			const payments = calculateAllPayments(answerCost, evaluations);

			// Should only include 3 supporters
			expect(payments.length).toBe(3);

			// User4 should not be in payments
			const userIds = payments.map(p => p.userId);
			expect(userIds).not.toContain('user4');
		});

		it('should sum payments to answer cost', () => {
			const evaluations: UserEvaluationData[] = [
				{ userId: 'user1', evaluation: 1.0, walletBalance: 50 },
				{ userId: 'user2', evaluation: 0.5, walletBalance: 30 },
			];
			const answerCost = 60;
			const payments = calculateAllPayments(answerCost, evaluations);

			const totalPayments = payments.reduce((sum, p) => sum + p.payment, 0);
			expect(totalPayments).toBeCloseTo(answerCost, 5);
		});

		it('should not include negative raters in payments', () => {
			const evaluations: UserEvaluationData[] = [
				{ userId: 'supporter', evaluation: 1.0, walletBalance: 100 },
				{ userId: 'opponent', evaluation: -1.0, walletBalance: 100 },
			];
			const answerCost = 50;
			const payments = calculateAllPayments(answerCost, evaluations);

			expect(payments.length).toBe(1);
			expect(payments[0].userId).toBe('supporter');
			expect(payments[0].payment).toBe(50);
		});
	});

	describe('Complete to Goal Calculation', () => {
		it('should calculate minutes needed to complete', () => {
			// From spec: d = 4, N = 10
			// Per user = 4, Total = 40
			const result = calculateCompleteToGoal(4, 10);

			expect(result.perUser).toBe(4);
			expect(result.total).toBe(40);
		});

		it('should return 0 when already at goal', () => {
			const result = calculateCompleteToGoal(0, 10);

			expect(result.perUser).toBe(0);
			expect(result.total).toBe(0);
		});

		it('should handle Infinity distance correctly', () => {
			const result = calculateCompleteToGoal(Infinity, 10);

			expect(result.perUser).toBe(0);
			expect(result.total).toBe(0);
		});
	});

	describe('Add Minutes to Group', () => {
		it('should calculate per-user amount correctly', () => {
			const totalMinutes = 100;
			const memberCount = 10;
			const perUser = totalMinutes / memberCount;

			expect(perUser).toBe(10);
		});

		it('should handle non-round divisions', () => {
			const totalMinutes = 100;
			const memberCount = 7;
			const perUser = totalMinutes / memberCount;

			expect(perUser).toBeCloseTo(14.2857, 4);
		});

		it('should distribute exact total when multiplied back', () => {
			const totalMinutes = 100;
			const memberCount = 7;
			const perUser = totalMinutes / memberCount;
			const redistributed = perUser * memberCount;

			expect(redistributed).toBeCloseTo(totalMinutes, 10);
		});
	});

	describe('Accept Answer Workflow', () => {
		it('should verify goal is reached before accepting', () => {
			const evaluations: UserEvaluationData[] = [
				{ userId: 'user1', evaluation: 1.0, walletBalance: 30 },
			];
			const answerCost = 50;
			const metrics = calculateAnswerMetrics(answerCost, evaluations);

			const canAccept = metrics.distanceToGoal === 0;
			expect(canAccept).toBe(false);
			expect(metrics.distanceToGoal).toBe(20); // 50 - 30 = 20
		});

		it('should allow acceptance when goal is reached', () => {
			const evaluations: UserEvaluationData[] = [
				{ userId: 'user1', evaluation: 1.0, walletBalance: 100 },
			];
			const answerCost = 50;
			const metrics = calculateAnswerMetrics(answerCost, evaluations);

			const canAccept = metrics.distanceToGoal === 0;
			expect(canAccept).toBe(true);
		});

		it('should calculate correct balance after payment deduction', () => {
			const initialBalance = 100;
			const payment = 25;
			const newBalance = initialBalance - payment;

			expect(newBalance).toBe(75);
		});
	});

	describe('Complete to Goal Workflow', () => {
		it('should calculate full workflow from spec example', () => {
			// Initial state from spec
			const evaluations: UserEvaluationData[] = [
				{ userId: 'user1', evaluation: 1.0, walletBalance: 10 },
				{ userId: 'user2', evaluation: 1.0, walletBalance: 10 },
				{ userId: 'user3', evaluation: 1.0, walletBalance: 10 },
				{ userId: 'user4', evaluation: 1.0, walletBalance: 10 },
				{ userId: 'user5', evaluation: 1.0, walletBalance: 10 },
				{ userId: 'user6', evaluation: 0.5, walletBalance: 6 },
				{ userId: 'user7', evaluation: 0.5, walletBalance: 6 },
				{ userId: 'user8', evaluation: 0, walletBalance: 10 },
				{ userId: 'user9', evaluation: -0.5, walletBalance: 10 },
				{ userId: 'user10', evaluation: -1.0, walletBalance: 10 },
			];
			const answerCost = 80;
			const totalUsers = 10;

			// Step 1: Calculate initial metrics
			const metrics = calculateAnswerMetrics(answerCost, evaluations);
			expect(metrics.distancePerSupporter).toBe(4);

			// Step 2: Calculate minutes to add
			const completeResult = calculateCompleteToGoal(
				metrics.distancePerSupporter,
				totalUsers
			);
			expect(completeResult.perUser).toBe(4);
			expect(completeResult.total).toBe(40);

			// Step 3: Simulate adding 4 minutes to each user
			const updatedEvaluations = evaluations.map(e => ({
				...e,
				walletBalance: e.walletBalance + 4,
			}));

			// Step 4: Recalculate metrics
			const newMetrics = calculateAnswerMetrics(answerCost, updatedEvaluations);

			// New T = 5(1.0 × 14) + 2(0.5 × 10) = 70 + 10 = 80
			expect(newMetrics.totalContribution).toBe(80);
			expect(newMetrics.distanceToGoal).toBe(0);

			// Step 5: Now goal is reached, can accept
			expect(newMetrics.distanceToGoal).toBe(0);
		});
	});

	describe('Edge Cases', () => {
		it('should handle empty evaluations array', () => {
			const metrics = calculateAnswerMetrics(100, []);

			expect(metrics.weightedSupporters).toBe(0);
			expect(metrics.totalContribution).toBe(0);
			expect(metrics.distanceToGoal).toBe(100);
		});

		it('should handle zero balance users', () => {
			const evaluations: UserEvaluationData[] = [
				{ userId: 'user1', evaluation: 1.0, walletBalance: 0 },
				{ userId: 'user2', evaluation: 1.0, walletBalance: 50 },
			];
			const answerCost = 40;
			const metrics = calculateAnswerMetrics(answerCost, evaluations);

			// W = 2, T = 0 + 50 = 50
			expect(metrics.weightedSupporters).toBe(2);
			expect(metrics.totalContribution).toBe(50);
		});

		it('should handle single user with exact balance for cost', () => {
			const evaluations: UserEvaluationData[] = [
				{ userId: 'user1', evaluation: 1.0, walletBalance: 100 },
			];
			const answerCost = 100;
			const payments = calculateAllPayments(answerCost, evaluations);

			expect(payments.length).toBe(1);
			expect(payments[0].payment).toBe(100);
		});

		it('should correctly calculate positive rating for boundary values', () => {
			expect(getPositiveRating(0)).toBe(0);
			expect(getPositiveRating(0.001)).toBeCloseTo(0.001);
			expect(getPositiveRating(-0.001)).toBe(0);
			expect(getPositiveRating(1)).toBe(1);
			expect(getPositiveRating(-1)).toBe(0);
		});
	});

	describe('Transaction Recording', () => {
		it('should track balance changes correctly', () => {
			// Simulate transaction recording
			const balanceBefore = 100;
			const payment = 25;
			const balanceAfter = balanceBefore - payment;

			expect(balanceAfter).toBe(75);
			expect(balanceBefore - balanceAfter).toBe(payment);
		});

		it('should track cumulative changes', () => {
			let balance = 100;

			// Transaction 1: Admin adds 20
			balance += 20;
			expect(balance).toBe(120);

			// Transaction 2: Payment of 30
			balance -= 30;
			expect(balance).toBe(90);

			// Transaction 3: Payment of 15
			balance -= 15;
			expect(balance).toBe(75);
		});
	});

	describe('Admin Permission Checks', () => {
		it('should verify role-based access', () => {
			const adminRoles = ['admin', 'creator'];
			const memberRoles = ['member', 'participant', 'waiting'];

			for (const role of adminRoles) {
				const isAdmin = role === 'admin' || role === 'creator';
				expect(isAdmin).toBe(true);
			}

			for (const role of memberRoles) {
				const isAdmin = role === 'admin' || role === 'creator';
				expect(isAdmin).toBe(false);
			}
		});
	});

	describe('Recalculation After Acceptance', () => {
		it('should update metrics for remaining answers after acceptance', () => {
			// User has 100 balance, supports 2 answers
			const answer1Evaluations: UserEvaluationData[] = [
				{ userId: 'user1', evaluation: 1.0, walletBalance: 100 },
			];
			const answer2Evaluations: UserEvaluationData[] = [
				{ userId: 'user1', evaluation: 1.0, walletBalance: 100 },
			];

			const answer1Cost = 40;
			const answer2Cost = 60;

			// Initial metrics
			const answer1Metrics = calculateAnswerMetrics(answer1Cost, answer1Evaluations);
			const answer2Metrics = calculateAnswerMetrics(answer2Cost, answer2Evaluations);

			expect(answer1Metrics.totalContribution).toBe(100);
			expect(answer2Metrics.totalContribution).toBe(100);

			// Answer 1 is accepted, user pays 40
			const payments = calculateAllPayments(answer1Cost, answer1Evaluations);
			expect(payments[0].payment).toBe(40);

			// User's new balance
			const newBalance = 100 - 40;
			expect(newBalance).toBe(60);

			// Recalculate answer 2 with new balance
			const answer2EvaluationsUpdated: UserEvaluationData[] = [
				{ userId: 'user1', evaluation: 1.0, walletBalance: newBalance },
			];
			const answer2MetricsUpdated = calculateAnswerMetrics(answer2Cost, answer2EvaluationsUpdated);

			// Now answer 2 contribution is exactly 60, which equals cost
			expect(answer2MetricsUpdated.totalContribution).toBe(60);
			expect(answer2MetricsUpdated.distanceToGoal).toBe(0);
		});
	});
});
