import { SortType, Statement } from '@freedi/shared-types';
import { isLiveResultsOn } from '@/helpers/liveResults';
import { getQuestionStage, QuestionStageIndex, STAGE_DECIDED } from '@/helpers/questionStage';
import { areResultsUnlocked } from '../evaluations/components/evaluation/enhancedEvaluation/resultsVisibility';
import { areResultsOffForEveryone, getResultsAccess, ResultsAccess } from './resultsLogic';

/**
 * The one guard for showing agreement to a person. Every participant score
 * surface (cards, marks, sorts, maps, tallies) asks this before it reveals
 * anything. The owner's rule: nothing shows agreement before the person has
 * rated, because a number seen first anchors the rating that follows.
 *
 * Results off comes first: while the "Show live results" switch is off and the
 * question is not settled (Decided, or deadline passed), nobody sees agreement,
 * hosts and authors included.
 *
 * While results can be shown, two deliberate exceptions to rating first: an
 * author always sees the score of their own answer, which they cannot rate
 * anyway, and a host keeps seeing scores.
 *
 * This is a display rule. Score fields stay on the statement documents.
 */

/** Facts about the question and the viewer, the same for every answer on screen. */
export interface ScoreViewerFacts {
	isHost: boolean;
	stage: QuestionStageIndex;
	/** `statementSettings.showEvaluation`, the "Show live results" switch. */
	showLiveResults: boolean;
	isDeadlinePassed: boolean;
	/** Nothing is left for this viewer to rate, so there is nothing to anchor. */
	ratingClosed: boolean;
}

export interface CanSeeScoreInput extends ScoreViewerFacts {
	isOwnAnswer: boolean;
	/** Rated this answer on an answer surface; rated or voted at all on a question-wide one. */
	hasRated: boolean;
}

export function canSeeScore(input: CanSeeScoreInput): boolean {
	const { isHost, isOwnAnswer, hasRated, ratingClosed, stage, isDeadlinePassed } = input;
	if (areResultsOffForEveryone(input)) return false;
	if (isOwnAnswer) return true;

	const unlocked = areResultsUnlocked({
		isCard: true,
		isOwnAnswer,
		hasRated,
		evaluationDisabled: ratingClosed || stage === STAGE_DECIDED || isDeadlinePassed,
		isSpaceAdmin: isHost,
	});
	const access = getResultsAccess({
		isHost,
		stage,
		isDeadlinePassed,
		showLiveResults: input.showLiveResults,
		ratedCount: unlocked ? 1 : 0,
	});

	return unlocked && access === 'visible';
}

/** The same answer as `canSeeScore`, for the Results tab's three states. */
export function getScoreAccess(input: CanSeeScoreInput): ResultsAccess {
	if (canSeeScore(input)) return 'visible';

	return input.showLiveResults ? 'rate-first' : 'hidden-by-host';
}

/** "Revealed after you rate": results are on, and only this viewer's rating is missing. */
export function shouldHintScoreReveal(input: CanSeeScoreInput): boolean {
	return input.showLiveResults && !canSeeScore(input);
}

/** What the question screen knows, as the guard's question-wide input. */
export interface QuestionScoreData {
	isHost: boolean;
	stage: QuestionStageIndex;
	showLiveResults: boolean;
	isDeadlinePassed: boolean;
	canRate: boolean;
	ratedCount: number;
	rateableCount: number;
	answersComplete: boolean;
	hasVoted: boolean;
}

export function questionScoreFacts(data: QuestionScoreData): ScoreViewerFacts {
	return {
		isHost: data.isHost,
		stage: data.stage,
		showLiveResults: data.showLiveResults,
		isDeadlinePassed: data.isDeadlinePassed,
		ratingClosed: !data.canRate || (data.answersComplete && data.rateableCount === 0),
	};
}

/** The input for surfaces that reveal the whole question at once. */
export function questionScoreInput(data: QuestionScoreData): CanSeeScoreInput {
	return {
		...questionScoreFacts(data),
		isOwnAnswer: false,
		hasRated: data.ratedCount > 0 || data.hasVoted,
	};
}

export function canSeeQuestionScores(data: QuestionScoreData): boolean {
	return canSeeScore(questionScoreInput(data));
}

/**
 * Vote tallies open once this person has voted. A rating does not count here:
 * the vote is the act they could still be swayed in.
 */
export function canSeeVoteTallies(facts: ScoreViewerFacts, hasVoted: boolean): boolean {
	return canSeeScore({ ...facts, isOwnAnswer: false, hasRated: hasVoted });
}

/** A question's own switch and clock, for screens without a viewer's facts. */
function questionSwitchFacts(
	question: Statement | undefined,
	now: number,
): Pick<ScoreViewerFacts, 'stage' | 'showLiveResults' | 'isDeadlinePassed'> {
	const deadline = question?.questionSettings?.deadline;

	return {
		stage: getQuestionStage({ statement: question, answerCount: 1, now }),
		showLiveResults: isLiveResultsOn(question),
		isDeadlinePassed: typeof deadline === 'number' && deadline > 0 && deadline <= now,
	};
}

/**
 * For host tools that have no reveal-after-rating of their own: only the
 * results-off rule applies to them. An unknown question counts as off.
 */
export function isQuestionResultsOff(question: Statement | undefined, now: number): boolean {
	return areResultsOffForEveryone(questionSwitchFacts(question, now));
}

/**
 * For screens listing questions, where a question's answers and the viewer's
 * ratings are not loaded: its results show only once they are settled, or to a
 * host while results are on.
 */
export function canSeeSettledResults(question: Statement, isHost: boolean, now: number): boolean {
	return canSeeScore({
		isHost,
		...questionSwitchFacts(question, now),
		ratingClosed: false,
		isOwnAnswer: false,
		hasRated: false,
	});
}

/** Whether this answer was written by this viewer. */
export function isOwnAnswerOf(
	answer: Pick<Statement, 'creatorId' | 'creator'> | undefined,
	userId: string | undefined,
): boolean {
	return !!userId && (answer?.creatorId === userId || answer?.creator?.uid === userId);
}

const SCORE_ORDERED_SORTS: ReadonlySet<string> = new Set<string>([
	SortType.accepted,
	SortType.averageEvaluation,
]);

/** A sort that puts answers in score order shows the ranking without any number. */
export function isScoreOrderedSort(sort: string | undefined): boolean {
	return sort !== undefined && SCORE_ORDERED_SORTS.has(sort);
}

/** The sort to apply: score orders fall back to newest for a viewer who may not see them. */
export function guardScoreSort<T extends string>(sort: T, canSeeScores: boolean): T | SortType {
	return !canSeeScores && isScoreOrderedSort(sort) ? SortType.newest : sort;
}

/**
 * Whether a viewer has "rated" an answer, for the reveal rule. Where 0 is a
 * cleared rating (two-face and community-voice cards), it does not count.
 * Liking is the only act on a single-like card: revealing per answer would
 * make liking the way to see a count, so one like anywhere in the question
 * opens the counts.
 */
export function hasRatedForScore({
	evaluationType,
	enhancedEvaluation,
	myEvaluation,
	likesInQuestion,
}: {
	evaluationType: string | undefined;
	enhancedEvaluation: boolean | undefined;
	myEvaluation: number | undefined;
	likesInQuestion: number;
}): boolean {
	if (evaluationType === 'single-like') return likesInQuestion > 0;
	if (evaluationType === 'range' || (!evaluationType && enhancedEvaluation)) {
		return myEvaluation !== undefined;
	}

	return myEvaluation !== undefined && myEvaluation !== 0;
}
