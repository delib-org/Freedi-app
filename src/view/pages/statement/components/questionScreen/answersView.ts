import {
	EvaluationUI,
	SortType,
	Statement,
	StatementType,
	isAnswerBatchQuestion,
} from '@freedi/shared-types';
import { getQuestionStage, STAGE_RATING } from '@/helpers/questionStage';

/**
 * Which view the Answers tab opens on. At 30 answers or fewer nothing changes.
 * Above that, while the question is being rated, people get a few answers at a
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

/** The question itself is one people rate a few answers at a time. */
export function isRateViewEligible({
	statement,
	answerCount,
	now,
}: RateViewEligibilityInput): boolean {
	if (statement?.statementType !== StatementType.question) return false;
	if (!isAnswerBatchQuestion(answerCount)) return false;
	if (statement.evaluationSettings?.evaluationUI === EvaluationUI.voting) return false;
	if (statement.statementSettings?.enableEvaluation === false) return false;
	if (statement.questionSettings?.isHalted === true) return false;
	const deadline = statement.questionSettings?.deadline;
	if (typeof deadline === 'number' && deadline > 0 && deadline <= now) return false;

	return getQuestionStage({ statement, answerCount, now }) === STAGE_RATING;
}

export interface ResolveAnswersViewInput {
	eligible: boolean;
	/** The sampler failed, or found the question small after all. */
	usesPlainList: boolean;
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
	paramSort,
	hasManualOrder,
	seeAll,
}: ResolveAnswersViewInput): AnswersViewDecision {
	if (!eligible || usesPlainList || hasManualOrder) {
		return { view: 'list', canReturnToRating: false };
	}
	const asksForAnotherSort = paramSort !== undefined && paramSort !== SortType.random;
	if (seeAll || asksForAnotherSort) return { view: 'list', canReturnToRating: true };

	return { view: 'rate', canReturnToRating: false };
}
