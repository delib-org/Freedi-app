/**
 * Tests for privacyUtils
 *
 * Tests k-anonymity checks, evaluation statistics, and privacy filtering.
 */

import {
	DEFAULT_K_ANONYMITY_THRESHOLD,
	PRIVACY_CONFIG,
	meetsKAnonymity,
	calculateEvaluationStats,
	groupUsersByDemographic,
	filterEvaluationsForPrivacy,
	generatePrivacyNotice,
	generateSuppressionNote,
} from '../privacyUtils';

describe('privacyUtils', () => {
	describe('constants', () => {
		it('should have DEFAULT_K_ANONYMITY_THRESHOLD of 3', () => {
			expect(DEFAULT_K_ANONYMITY_THRESHOLD).toBe(3);
		});

		it('should have PRIVACY_CONFIG with correct values', () => {
			expect(PRIVACY_CONFIG.K_ANONYMITY_THRESHOLD).toBe(3);
			expect(PRIVACY_CONFIG.IN_QUERY_BATCH_SIZE).toBe(30);
		});
	});

	describe('meetsKAnonymity', () => {
		it('should return true when group size meets threshold', () => {
			expect(meetsKAnonymity(3)).toBe(true);
			expect(meetsKAnonymity(5)).toBe(true);
		});

		it('should return false when group size is below threshold', () => {
			expect(meetsKAnonymity(2)).toBe(false);
			expect(meetsKAnonymity(1)).toBe(false);
			expect(meetsKAnonymity(0)).toBe(false);
		});

		it('should use custom threshold when provided', () => {
			expect(meetsKAnonymity(4, 5)).toBe(false);
			expect(meetsKAnonymity(5, 5)).toBe(true);
		});
	});

	describe('calculateEvaluationStats', () => {
		it('should return zero stats for empty evaluations', () => {
			const stats = calculateEvaluationStats([]);
			expect(stats.evaluatorCount).toBe(0);
			expect(stats.sumEvaluations).toBe(0);
			expect(stats.averageEvaluation).toBe(0);
			expect(stats.proCount).toBe(0);
			expect(stats.conCount).toBe(0);
			expect(stats.neutralCount).toBe(0);
			expect(stats.meetsKAnonymity).toBe(false);
		});

		it('should calculate correct stats for mixed evaluations', () => {
			const evaluations = [0.5, -0.3, 0, 1, -1];
			const stats = calculateEvaluationStats(evaluations);

			expect(stats.evaluatorCount).toBe(5);
			expect(stats.sumEvaluations).toBeCloseTo(0.2);
			expect(stats.averageEvaluation).toBeCloseTo(0.04);
			expect(stats.proCount).toBe(2);
			expect(stats.conCount).toBe(2);
			expect(stats.neutralCount).toBe(1);
			expect(stats.meetsKAnonymity).toBe(true);
		});

		it('should report meetsKAnonymity as false when below threshold', () => {
			const stats = calculateEvaluationStats([0.5, -0.5]);
			expect(stats.meetsKAnonymity).toBe(false);
		});

		it('should handle all positive evaluations', () => {
			const stats = calculateEvaluationStats([0.5, 0.8, 1]);
			expect(stats.proCount).toBe(3);
			expect(stats.conCount).toBe(0);
			expect(stats.neutralCount).toBe(0);
		});

		it('should handle all neutral evaluations', () => {
			const stats = calculateEvaluationStats([0, 0, 0]);
			expect(stats.proCount).toBe(0);
			expect(stats.conCount).toBe(0);
			expect(stats.neutralCount).toBe(3);
			expect(stats.averageEvaluation).toBe(0);
		});
	});

	describe('groupUsersByDemographic', () => {
		it('should group users by their single answers', () => {
			const answers = [
				{ userId: 'u1', answer: 'Male' },
				{ userId: 'u2', answer: 'Female' },
				{ userId: 'u3', answer: 'Male' },
			];
			const groups = groupUsersByDemographic(answers);

			expect(groups.get('Male')?.size).toBe(2);
			expect(groups.get('Female')?.size).toBe(1);
		});

		it('should handle array answers (checkbox)', () => {
			const answers = [
				{ userId: 'u1', answer: ['A', 'B'] as string[] },
				{ userId: 'u2', answer: ['B', 'C'] as string[] },
			];
			const groups = groupUsersByDemographic(answers);

			expect(groups.get('A')?.size).toBe(1);
			expect(groups.get('B')?.size).toBe(2);
			expect(groups.get('C')?.size).toBe(1);
		});

		it('should skip undefined answers', () => {
			const answers = [
				{ userId: 'u1', answer: 'Yes' },
				{ userId: 'u2', answer: undefined },
			];
			const groups = groupUsersByDemographic(answers);

			expect(groups.size).toBe(1);
			expect(groups.get('Yes')?.size).toBe(1);
		});

		it('should return empty map for empty input', () => {
			const groups = groupUsersByDemographic([]);
			expect(groups.size).toBe(0);
		});
	});

	describe('filterEvaluationsForPrivacy', () => {
		it('should allow stats when k-anonymity is met', () => {
			const result = filterEvaluationsForPrivacy([0.5, -0.3, 0.8]);
			expect(result.allowed).toBe(true);
			expect(result.count).toBe(3);
			expect(result.stats).not.toBeNull();
			expect(result.stats?.evaluatorCount).toBe(3);
		});

		it('should block stats when k-anonymity is not met', () => {
			const result = filterEvaluationsForPrivacy([0.5, -0.3]);
			expect(result.allowed).toBe(false);
			expect(result.count).toBe(2);
			expect(result.stats).toBeNull();
		});

		it('should handle empty evaluations', () => {
			const result = filterEvaluationsForPrivacy([]);
			expect(result.allowed).toBe(false);
			expect(result.count).toBe(0);
			expect(result.stats).toBeNull();
		});

		it('should use custom threshold', () => {
			const result = filterEvaluationsForPrivacy([0.5], 1);
			expect(result.allowed).toBe(true);
		});
	});

	describe('generatePrivacyNotice', () => {
		it('should include k value and suppressed count', () => {
			const notice = generatePrivacyNotice(3, 5);
			expect(notice).toContain('k=3');
			expect(notice).toContain('3 or more users');
			expect(notice).toContain('5 group(s)');
		});

		it('should handle zero suppressed groups', () => {
			const notice = generatePrivacyNotice(5, 0);
			expect(notice).toContain('k=5');
			expect(notice).toContain('0 group(s)');
		});
	});

	describe('generateSuppressionNote', () => {
		it('should include group size and threshold', () => {
			const note = generateSuppressionNote(2, 3);
			expect(note).toContain('2');
			expect(note).toContain('3');
			expect(note).toContain('withheld');
		});
	});
});
