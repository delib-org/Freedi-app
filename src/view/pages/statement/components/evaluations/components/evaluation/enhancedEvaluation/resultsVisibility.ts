export interface ResultsUnlockedInput {
	/** True for the answer-card variant, where results wait for the rating. */
	isCard: boolean;
	isOwnAnswer: boolean;
	hasRated: boolean;
	/** Rating is disabled, so there is nothing to anchor. */
	evaluationDisabled: boolean;
	/** Admin / creator of the space. */
	isSpaceAdmin: boolean;
}

/**
 * Whether the score may be shown on an evaluation card now.
 * Participants keep the reveal-after-rating rule; admins of the space
 * always see the score. The overall on/off switch is
 * statementSettings.showEvaluation, applied by the caller.
 */
export function areResultsUnlocked({
	isCard,
	isOwnAnswer,
	hasRated,
	evaluationDisabled,
	isSpaceAdmin,
}: ResultsUnlockedInput): boolean {
	return !isCard || isOwnAnswer || hasRated || evaluationDisabled || isSpaceAdmin;
}

/** Final rule: the admin setting must be on, then the unlock rule applies. */
export function shouldShowResults(showEvaluation: boolean, input: ResultsUnlockedInput): boolean {
	return showEvaluation && areResultsUnlocked(input);
}

/** The "revealed after you rate" note: setting on, results still locked. */
export function shouldShowRevealHint(
	showEvaluation: boolean,
	input: ResultsUnlockedInput,
): boolean {
	return showEvaluation && !areResultsUnlocked(input);
}
