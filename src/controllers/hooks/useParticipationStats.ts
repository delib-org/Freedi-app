import { QuestionProgress, Statement, StatementType } from '@freedi/shared-types';
import { useQuestionProgress } from './useQuestionProgress';

export interface ParticipationStats {
	/** Unique users who entered the question */
	entered: number;
	/** Unique users who suggested options */
	suggested: number;
	/** Unique users who evaluated options */
	evaluated: number;
}

/**
 * View tracking started mid-project, so `entered` alone can undercount: never
 * report fewer entrants than the people known to have taken part.
 */
function toHostStats(progress: QuestionProgress): ParticipationStats {
	const { entered, suggested, evaluated } = progress;

	return { entered: Math.max(entered, suggested, evaluated), suggested, evaluated };
}

/**
 * The participation funnel of a question, for its hosts: one read of
 * `questionProgress/{questionId}`, repeated at most once a minute as answers
 * arrive. Everyone else makes no read at all, and participants get their own
 * rounded view from `GroupProgress`.
 *
 * Null until the numbers are known, and for a question with no counters yet,
 * so a host never reads a zero that only means "not loaded".
 */
export function useParticipationStats(
	statement: Statement | undefined,
	isHost: boolean,
	answersCount: number,
): ParticipationStats | null {
	const isQuestion = statement?.statementType === StatementType.question;
	const progress = useQuestionProgress(
		isHost && isQuestion ? statement?.statementId : undefined,
		String(answersCount),
	);

	return progress ? toHostStats(progress) : null;
}
