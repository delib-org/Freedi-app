import { QuestionProgress, Statement } from '@freedi/shared-types';
import { PRESENCE } from '@/constants/common';

/**
 * Whether a statement has too many people for live presence. `entered` catches
 * a crowd arriving before anyone has rated; the rater counters on the statement
 * still answer when the progress counters are missing.
 */
export function isLargeForPresence(
	statement: Statement | undefined,
	progress: Pick<QuestionProgress, 'entered'> | null,
): boolean {
	const people = Math.max(
		progress?.entered ?? 0,
		statement?.evaluation?.asParentTotalEvaluators ?? 0,
		statement?.totalEvaluators ?? 0,
	);

	return people >= PRESENCE.LARGE_QUESTION_PEOPLE;
}
