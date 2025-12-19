/**
 * Privacy Utilities for Data Export
 *
 * Implements k-anonymity and data aggregation for privacy-preserving exports.
 * These functions ensure that demographic breakdowns only reveal data when
 * a sufficient number of users (k) share the same characteristic.
 */

/**
 * Default k-anonymity threshold
 * Groups with fewer than this many users will not have their evaluation details revealed
 */
export const DEFAULT_K_ANONYMITY_THRESHOLD = 3;

/**
 * Privacy configuration constants
 */
export const PRIVACY_CONFIG = {
	/** Minimum users required to reveal demographic breakdown (k-anonymity) */
	K_ANONYMITY_THRESHOLD: DEFAULT_K_ANONYMITY_THRESHOLD,
	/** Firestore 'in' query batch size limit */
	IN_QUERY_BATCH_SIZE: 30,
} as const;

/**
 * Evaluation statistics for a demographic group
 */
export interface GroupEvaluationStats {
	/** Number of evaluators in this group */
	evaluatorCount: number;
	/** Sum of evaluation values (-1 to 1) */
	sumEvaluations: number;
	/** Average evaluation */
	averageEvaluation: number;
	/** Count of positive evaluations (> 0) */
	proCount: number;
	/** Count of negative evaluations (< 0) */
	conCount: number;
	/** Count of neutral evaluations (= 0) */
	neutralCount: number;
	/** Whether this group meets k-anonymity */
	meetsKAnonymity: boolean;
}

/**
 * Result of privacy filtering
 */
export interface PrivacyFilterResult {
	/** Whether evaluation details are allowed to be shown */
	allowed: boolean;
	/** Number of users in the group */
	count: number;
	/** Evaluation stats - only populated if allowed is true */
	stats: GroupEvaluationStats | null;
}

/**
 * Check if a group meets k-anonymity requirements
 * @param groupSize - Number of users in the group
 * @param k - Minimum threshold (defaults to PRIVACY_CONFIG.K_ANONYMITY_THRESHOLD)
 * @returns true if group meets k-anonymity
 */
export function meetsKAnonymity(
	groupSize: number,
	k: number = PRIVACY_CONFIG.K_ANONYMITY_THRESHOLD
): boolean {
	return groupSize >= k;
}

/**
 * Calculate aggregated evaluation stats for a set of evaluation values
 * @param evaluations - Array of evaluation values (-1 to 1)
 * @param k - K-anonymity threshold
 * @returns Aggregated statistics with k-anonymity flag
 */
export function calculateEvaluationStats(
	evaluations: number[],
	k: number = PRIVACY_CONFIG.K_ANONYMITY_THRESHOLD
): GroupEvaluationStats {
	const meetsK = evaluations.length >= k;

	if (evaluations.length === 0) {
		return {
			evaluatorCount: 0,
			sumEvaluations: 0,
			averageEvaluation: 0,
			proCount: 0,
			conCount: 0,
			neutralCount: 0,
			meetsKAnonymity: false,
		};
	}

	const sumEvaluations = evaluations.reduce((sum, val) => sum + val, 0);
	const averageEvaluation = sumEvaluations / evaluations.length;

	let proCount = 0;
	let conCount = 0;
	let neutralCount = 0;

	evaluations.forEach((val) => {
		if (val > 0) proCount++;
		else if (val < 0) conCount++;
		else neutralCount++;
	});

	return {
		evaluatorCount: evaluations.length,
		sumEvaluations,
		averageEvaluation,
		proCount,
		conCount,
		neutralCount,
		meetsKAnonymity: meetsK,
	};
}

/**
 * Group users by their demographic answer for a specific question
 * @param answers - Array of user answers with userId and answer value
 * @returns Map of optionValue -> Set of userIds
 */
export function groupUsersByDemographic(
	answers: Array<{ userId: string; answer: string | string[] | undefined }>
): Map<string, Set<string>> {
	const groups = new Map<string, Set<string>>();

	answers.forEach(({ userId, answer }) => {
		if (!answer) return;

		// Handle both single answer and array of answers (checkbox)
		const answerArray = Array.isArray(answer) ? answer : [answer];

		answerArray.forEach((ans) => {
			if (!groups.has(ans)) {
				groups.set(ans, new Set());
			}
			groups.get(ans)?.add(userId);
		});
	});

	return groups;
}

/**
 * Filter evaluation data based on k-anonymity for a demographic group
 * If group doesn't meet k-anonymity, returns count only (no evaluation details)
 * @param evaluations - Array of evaluation values
 * @param k - K-anonymity threshold
 * @returns Privacy filter result with allowed flag, count, and optional stats
 */
export function filterEvaluationsForPrivacy(
	evaluations: number[],
	k: number = PRIVACY_CONFIG.K_ANONYMITY_THRESHOLD
): PrivacyFilterResult {
	const meetsK = evaluations.length >= k;

	if (!meetsK) {
		return {
			allowed: false,
			count: evaluations.length,
			stats: null,
		};
	}

	return {
		allowed: true,
		count: evaluations.length,
		stats: calculateEvaluationStats(evaluations, k),
	};
}

/**
 * Generate privacy notice text for export
 * @param k - K-anonymity threshold used
 * @param suppressedCount - Number of groups that had data suppressed
 * @returns Privacy notice string
 */
export function generatePrivacyNotice(
	k: number,
	suppressedCount: number
): string {
	return (
		`This export uses k-anonymity (k=${k}) to protect user privacy. ` +
		`Demographic breakdowns are only shown when ${k} or more users share the same demographic characteristic. ` +
		`${suppressedCount} group(s) had their evaluation details withheld due to insufficient group size.`
	);
}

/**
 * Generate privacy note for a suppressed group
 * @param groupSize - Actual size of the group
 * @param k - K-anonymity threshold
 * @returns Privacy note string
 */
export function generateSuppressionNote(groupSize: number, k: number): string {
	return `Group size (${groupSize}) below k-anonymity threshold (${k}). Evaluation details withheld for privacy.`;
}
