import { AgoraSessionOutcome } from './agoraEnums';
import { AGORA_OUTCOME } from './agoraConstants';

export interface AgoraOutcomeInput {
	/** Combined class score, 0-100 */
	total: number;
	/** Success threshold applied to this session */
	threshold: number;
	/** Proposals rated by at least one left AND one right student rater (AI raters excluded) */
	crossRatedProposals: number;
	/** Distinct student raters / positioned students, 0..1 (AI raters excluded) */
	raterCoverage: number;
}

/**
 * Decide how the session ended. Success clears the class-score threshold.
 * Short of that, a class that genuinely deliberated — enough students rating,
 * proposals examined from both camps — mapped the divergence and earns the
 * honest-disagreement ending rather than the collapse one.
 */
export function deriveAgoraOutcome(input: AgoraOutcomeInput): AgoraSessionOutcome {
	if (input.total >= input.threshold) return AgoraSessionOutcome.success;

	const mappedDivergence =
		input.crossRatedProposals >= AGORA_OUTCOME.MIN_CROSS_RATED_PROPOSALS &&
		input.raterCoverage >= AGORA_OUTCOME.MIN_RATER_COVERAGE;

	return mappedDivergence
		? AgoraSessionOutcome.honestDisagreement
		: AgoraSessionOutcome.collapse;
}
