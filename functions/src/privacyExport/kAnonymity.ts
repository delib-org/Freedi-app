/**
 * K-anonymity utilities for the privacy-preserving export (server-side).
 *
 * Ported from the client's `src/utils/privacyUtils.ts` so aggregation and
 * suppression behave identically whether the export runs on the client
 * (fallback path) or in the Cloud Function.
 */

export const DEFAULT_K_ANONYMITY_THRESHOLD = 3;

export const PRIVACY_CONFIG = {
	/** Minimum users required to reveal a demographic breakdown (k-anonymity). */
	K_ANONYMITY_THRESHOLD: DEFAULT_K_ANONYMITY_THRESHOLD,
	/** Firestore 'in' query batch size limit. */
	IN_QUERY_BATCH_SIZE: 30,
} as const;

export interface GroupEvaluationStats {
	evaluatorCount: number;
	sumEvaluations: number;
	averageEvaluation: number;
	proCount: number;
	conCount: number;
	neutralCount: number;
	meetsKAnonymity: boolean;
}

export interface PrivacyFilterResult {
	allowed: boolean;
	count: number;
	stats: GroupEvaluationStats | null;
}

export function calculateEvaluationStats(
	evaluations: number[],
	k: number = PRIVACY_CONFIG.K_ANONYMITY_THRESHOLD,
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

export function filterEvaluationsForPrivacy(
	evaluations: number[],
	k: number = PRIVACY_CONFIG.K_ANONYMITY_THRESHOLD,
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

export function generatePrivacyNotice(k: number, suppressedCount: number): string {
	return (
		`This export uses k-anonymity (k=${k}) to protect user privacy. ` +
		`Demographic breakdowns are only shown when ${k} or more users share the same demographic characteristic. ` +
		`${suppressedCount} group(s) had their evaluation details withheld due to insufficient group size.`
	);
}

export function generateSuppressionNote(groupSize: number, k: number): string {
	return `Group size (${groupSize}) below k-anonymity threshold (${k}). Evaluation details withheld for privacy.`;
}
