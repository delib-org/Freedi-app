import {
	EvaluationUI,
	SortType,
	Statement,
	StatementType,
	isAnswerBatchQuestion,
} from '@freedi/shared-types';
import { canRateQuestion, getQuestionStage, isQuestionHalted } from '@/helpers/questionStage';

/**
 * Which view the Answers tab opens on. At 30 answers or fewer nothing changes.
 * Above that, wherever people can rate, they get a few answers at a
 * time to rate; "See all answers" is the way to the full list.
 */

export type AnswersView = 'rate' | 'list';

/** `?answers=all`: the full list, chosen with "See all answers". */
export const ANSWERS_VIEW_PARAM = 'answers';
export const ANSWERS_VIEW_ALL = 'all';

export interface RateViewEligibilityInput {
	statement: Statement | undefined;
	answerCount: number;
	now: number;
}

/**
 * The question itself is one people rate a few answers at a time, whichever
 * stage it is in. Single-like and vote-limited questions ask a person to choose
 * among all the answers, so they keep the list.
 */
export function isRateViewEligible({
	statement,
	answerCount,
	now,
}: RateViewEligibilityInput): boolean {
	if (statement?.statementType !== StatementType.question) return false;
	if (!isAnswerBatchQuestion(answerCount)) return false;
	if (statement.evaluationSettings?.evaluationUI === EvaluationUI.voting) return false;
	if (statement.statementSettings?.evaluationType === 'single-like') return false;
	if (statement.evaluationSettings?.maxVotesPerUser) return false;
	const stage = getQuestionStage({ statement, answerCount, now });

	return canRateQuestion(statement, stage, isQuestionHalted(statement, now));
}

export interface ResolveAnswersViewInput {
	eligible: boolean;
	/** The sampler found the question small after all. */
	usesPlainList: boolean;
	/** The last sampler call failed; this view shows the list until a retry works. */
	rateFailed: boolean;
	/** The `:sort` route segment, when the reader asked for one. */
	paramSort: string | undefined;
	hasManualOrder: boolean;
	seeAll: boolean;
}

export interface AnswersViewDecision {
	view: AnswersView;
	/** On the list, with Rate reachable: show "Back to rating". */
	canReturnToRating: boolean;
}

export function resolveAnswersView({
	eligible,
	usesPlainList,
	rateFailed,
	paramSort,
	hasManualOrder,
	seeAll,
}: ResolveAnswersViewInput): AnswersViewDecision {
	if (!eligible || usesPlainList || rateFailed || hasManualOrder) {
		return { view: 'list', canReturnToRating: false };
	}
	const asksForAnotherSort = paramSort !== undefined && paramSort !== SortType.random;
	if (seeAll || asksForAnotherSort) return { view: 'list', canReturnToRating: true };

	return { view: 'rate', canReturnToRating: false };
}
