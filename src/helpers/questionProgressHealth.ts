import { QuestionProgress } from '@freedi/shared-types';
import { PARTICIPATION } from '@/constants/common';

export interface KnownParticipation {
	/** Distinct raters according to the question document. */
	raters: number;
	/** Genuine answers the host's screen already holds. */
	answers: number;
}

function isClearlyBehind(counter: number, known: number): boolean {
	const allowedLag = Math.max(
		PARTICIPATION.COUNTER_LAG_MIN,
		Math.ceil(known * PARTICIPATION.COUNTER_LAG_RATIO),
	);

	return known - counter > allowedLag;
}

/**
 * Whether a question's counters are missing or wrong, which is the normal state
 * of a question older than the counters. Compares `options` rather than
 * `suggested` with the answers, because one person can add many answers.
 */
export function needsProgressRebuild(
	progress: Pick<QuestionProgress, 'evaluated' | 'options'> | null,
	known: KnownParticipation,
): boolean {
	if (!progress) return known.raters > 0 || known.answers > 0;

	return (
		isClearlyBehind(progress.evaluated, known.raters) ||
		isClearlyBehind(progress.options, known.answers)
	);
}
