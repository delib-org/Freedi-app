import { QuestionProgress, Statement, StatementType } from '@freedi/shared-types';
import { useQuestionProgressRead } from './useQuestionProgress';

export interface ParticipationStats {
	/** Unique users who entered the question */
	entered: number;
	/** Unique users who suggested options */
	suggested: number;
	/** Unique users who evaluated options */
	evaluated: number;
}

const ALWAYS_POLL = (): boolean => true;

/**
 * View tracking started mid-project, so `entered` alone can undercount: never
 * report fewer entrants than the people known to have taken part.
 */
function toHostStats(progress: QuestionProgress): ParticipationStats {
	const { entered, suggested, evaluated } = progress;

	return { entered: Math.max(entered, suggested, evaluated), suggested, evaluated };
}

/**
 * The participation funnel of a question, for its hosts: reads of
 * `questionProgress/{questionId}`, at most one a minute and paused in a hidden
 * tab. Everyone else makes no read at all, and participants get their own
 * rounded view from `GroupProgress`.
 *
 * Null while loading and for a question with no counters, so a host never
 * reads a zero that only means "not loaded". The app never rebuilds counters:
 * questions older than them are a release step (scripts/backfillQuestionProgress.ts).
 */
export function useParticipationStats(
	statement: Statement | undefined,
	isHost: boolean,
	answersCount: number,
): ParticipationStats | null {
	const isQuestion = statement?.statementType === StatementType.question;
	const hostStatementId = isHost && isQuestion ? statement?.statementId : undefined;
	const { progress } = useQuestionProgressRead(hostStatementId, String(answersCount), {
		pollWhile: hostStatementId ? ALWAYS_POLL : undefined,
	});

	return progress ? toHostStats(progress) : null;
}
