import {
	CutoffBy,
	DEFAULT_MIN_EVALUATORS,
	ResultsSettings,
	Statement,
	defaultResultsSettings,
} from '@freedi/shared-types';
import { getConsensusScore } from '@/redux/utils/selectorFactories';
import { formatScoreThreshold, toDisplayScore } from '@/helpers/scoreFormat';
import {
	QuestionStageIndex,
	STAGE_COLLECTING,
	STAGE_DECIDED,
	STAGE_VOTING,
} from '@/helpers/questionStage';

/**
 * Pure decisions behind the Results tab and the answers counter: who may read
 * results right now, which answers count as "leading" under the question's own
 * results selection, and the one-line cue under the stage bar.
 */

export type ResultsAccess = 'visible' | 'rate-first' | 'hidden-by-host';

export interface ResultsAccessInput {
	isHost: boolean;
	stage: QuestionStageIndex;
	/** Answers the viewer rated under this question. */
	ratedCount: number;
	/** `statementSettings.showEvaluation` — the host's "live results for participants". */
	showLiveResults: boolean;
	isDeadlinePassed: boolean;
}

/**
 * - Hosts always read results.
 * - A decided question (stage 3) or one whose clock ran out is always readable.
 * - Live results switched off by the host → hidden for participants.
 * - Mid-flow (rating or voting) with nothing rated yet → rate first, so the
 *   viewer's own rating stays independent.
 * - Otherwise readable (including while still collecting).
 */
export function getResultsAccess({
	isHost,
	stage,
	ratedCount,
	showLiveResults,
	isDeadlinePassed,
}: ResultsAccessInput): ResultsAccess {
	if (isHost || stage === STAGE_DECIDED || isDeadlinePassed) return 'visible';
	if (!showLiveResults) return 'hidden-by-host';
	if (stage !== STAGE_COLLECTING && ratedCount === 0) return 'rate-first';

	return 'visible';
}

/** Answers that take part in results: visible, and not a pipeline cluster (syntheses count). */
export function rankableAnswers(options: readonly Statement[]): Statement[] {
	const unique = new Map<string, Statement>();
	options
		.filter((p) => !p.hide && (!p.isCluster || p.derivedByPipeline === 'synthesis'))
		.forEach((p) => unique.set(p.statementId, p));

	return [...unique.values()];
}

export function evaluatorCount(statement: Statement): number {
	return statement.evaluation?.numberOfEvaluators ?? 0;
}

/** Every answer, rated ones first by consensus, unrated ones after in creation order. */
export function rankAnswers(options: readonly Statement[]): Statement[] {
	return rankableAnswers(options).sort((a, b) => {
		const aRated = evaluatorCount(a) > 0;
		const bRated = evaluatorCount(b) > 0;
		if (aRated !== bRated) return aRated ? -1 : 1;
		if (aRated) {
			const diff = getConsensusScore(b) - getConsensusScore(a);
			if (diff !== 0) return diff;
		}

		return a.createdAt - b.createdAt;
	});
}

/** The question's results selection, with the shared defaults filled in. */
export function resolveResultsSelection(settings: ResultsSettings | undefined): {
	cutoffBy: CutoffBy;
	numberOfResults: number;
	cutoffNumber: number;
} {
	return {
		cutoffBy: settings?.cutoffBy ?? defaultResultsSettings.cutoffBy ?? CutoffBy.topOptions,
		numberOfResults: Math.max(
			1,
			Math.round(settings?.numberOfResults ?? defaultResultsSettings.numberOfResults ?? 1),
		),
		cutoffNumber: settings?.cutoffNumber ?? defaultResultsSettings.cutoffNumber ?? 0,
	};
}

/**
 * The leading answers under the question's own results selection
 * (`resultsSettings.cutoffBy`): top N, every answer at/above the threshold, or
 * every rated answer. Only answers someone rated can lead.
 */
export function selectLeadingAnswers(
	options: readonly Statement[],
	settings: ResultsSettings | undefined,
): Statement[] {
	const { cutoffBy, numberOfResults, cutoffNumber } = resolveResultsSelection(settings);
	const rated = rankAnswers(options).filter((p) => evaluatorCount(p) > 0);

	if (cutoffBy === CutoffBy.all) return rated;
	if (cutoffBy === CutoffBy.aboveThreshold) {
		return rated.filter((p) => getConsensusScore(p) >= cutoffNumber);
	}

	return rated.slice(0, numberOfResults);
}

export interface Caption {
	key: string;
	value?: string;
}

/** The rule caption under "Leading now" / "What was chosen". */
export function resultsRuleCaption(
	settings: ResultsSettings | undefined,
	decided: boolean,
): Caption {
	const { cutoffBy, numberOfResults, cutoffNumber } = resolveResultsSelection(settings);
	if (cutoffBy === CutoffBy.aboveThreshold) {
		return {
			key: decided ? 'By consensus · threshold {n}' : 'Above the agreement threshold ({n})',
			value: formatScoreThreshold(cutoffNumber),
		};
	}
	if (cutoffBy === CutoffBy.all) return { key: 'Every rated answer, by agreement' };

	return {
		key: decided ? 'By consensus · top {n}' : 'Top {n} by agreement',
		value: String(numberOfResults),
	};
}

export type ScoreTone = 'positive' | 'split' | 'negative';

/** The bands, on the −100…+100 scale people read. */
export const SCORE_BROAD_MIN = 60;
export const SCORE_POSITIVE_MIN = 30;
export const SCORE_SPLIT_MIN = -10;

export function scoreTone(score: number): ScoreTone {
	const display = toDisplayScore(score);
	if (display >= SCORE_POSITIVE_MIN) return 'positive';
	if (display > SCORE_SPLIT_MIN) return 'split';

	return 'negative';
}

/** The plain-language label for an answer's score. A score from a few raters says little. */
export function scoreLabelKey(score: number, raterCount: number): string {
	if (raterCount < DEFAULT_MIN_EVALUATORS) return 'Too few ratings so far';
	const display = toDisplayScore(score);
	if (display >= SCORE_BROAD_MIN) return 'Broad agreement';
	if (display >= SCORE_POSITIVE_MIN) return 'Partial agreement';
	if (display > SCORE_SPLIT_MIN) return 'Split';

	return 'Opposition';
}

/** A −1…1 score as a 0…100 bar width. */
export function scorePercent(score: number): number {
	const clamped = Math.max(-1, Math.min(1, score));

	return Math.round(((clamped + 1) / 2) * 100);
}

export interface AnswerCoverageInput {
	/** Answers of this question in the store, hidden ones included. */
	loadedAnswers: number;
	/** Children of any type in the store: the listener's window counts these, not answers. */
	loadedChildren: number;
	/** Server counter. Missing on questions older than the counter. */
	numberOfOptions: number | undefined;
	isFullyLoaded: boolean;
	/** How many children the question screen's first listener asks for. */
	childrenWindow: number;
}

/**
 * Whether the answers in the store are all the answers of the question, the
 * only case where "none yet", "all rated" or a remaining count can be true.
 * The store normally holds the newest children of any type, so a busy
 * discussion can push every answer out of it.
 *
 * A counter that disagrees either way is treated as not known: below the loaded
 * count it is provably stale, above it there are answers not loaded. Without a
 * counter, a window that did not fill means nothing was left out.
 */
export function areAnswersComplete({
	loadedAnswers,
	loadedChildren,
	numberOfOptions,
	isFullyLoaded,
	childrenWindow,
}: AnswerCoverageInput): boolean {
	if (isFullyLoaded) return true;
	if (numberOfOptions === undefined) return loadedChildren < childrenWindow;

	return loadedAnswers === numberOfOptions;
}

export interface StageCueInput {
	stage: QuestionStageIndex;
	/** Host halt, or the deadline passed. */
	isHalted: boolean;
	canRate: boolean;
	canAddAnswer: boolean;
	/** `evaluationUI === voting`: the question's answers are voted on, not rated. */
	usesVotingUI: boolean;
	hasVoted: boolean;
	ratedCount: number;
	rateableCount: number;
	/** See `areAnswersComplete`: without it the counts say nothing about the whole question. */
	answersComplete: boolean;
}

type RateProgress = 'nothing' | 'none' | 'some' | 'all';
type RateRow = Readonly<Record<RateProgress, string>>;

const COLLECTING_ADD_AND_RATE: RateRow = {
	nothing: 'noneToRateAdd',
	none: 'addOrRate',
	some: 'moreToRateAdd',
	all: 'ratedAllAdd',
};
const RATING_ADD_AND_RATE: RateRow = {
	nothing: 'noneToRateAdd',
	none: 'rateEach',
	some: 'moreToRate',
	all: 'ratedAllAdd',
};
const RATE_ONLY: RateRow = {
	nothing: 'noneToRate',
	none: 'rateEach',
	some: 'moreToRate',
	all: 'ratedAll',
};

/** Partly loaded answers read as "none": the row's general cue, with no number and no thanks. */
function rateProgress(
	ratedCount: number,
	rateableCount: number,
	answersComplete: boolean,
): RateProgress {
	if (!answersComplete) return 'none';
	if (rateableCount === 0) return 'nothing';
	if (ratedCount === 0) return 'none';

	return ratedCount < rateableCount ? 'some' : 'all';
}

function votingCueName({
	canRate,
	canAddAnswer,
	hasVoted,
	rateableCount,
	answersComplete,
}: StageCueInput): string {
	if (!canRate) return canAddAnswer ? 'votingClosedAdd' : 'votingClosedRead';
	if (hasVoted) return canAddAnswer ? 'votedAdd' : 'voted';
	if (answersComplete && rateableCount === 0) return canAddAnswer ? 'noneToVoteAdd' : 'noneToVote';

	return canAddAnswer ? 'voteOrAdd' : 'voteOne';
}

function ratingCueName(input: StageCueInput): string {
	const { stage, canRate, canAddAnswer, ratedCount, rateableCount, answersComplete } = input;
	const isCollecting = stage === STAGE_COLLECTING;
	if (!canRate) {
		if (isCollecting) return canAddAnswer ? 'addRatingLater' : 'collectingRead';

		return canAddAnswer ? 'ratingClosedAdd' : 'ratingClosedRead';
	}
	const collectingOrRating = isCollecting ? COLLECTING_ADD_AND_RATE : RATING_ADD_AND_RATE;

	return (canAddAnswer ? collectingOrRating : RATE_ONLY)[
		rateProgress(ratedCount, rateableCount, answersComplete)
	];
}

/**
 * The one line under the stage bar that says what to do now. Decided first,
 * then a halted question, then the voting table for anyone who can vote on a
 * voting UI, whatever the stage says, and otherwise the table of the actual stage.
 */
export function getStageCue(input: StageCueInput): Caption {
	const { stage, isHalted, canRate, usesVotingUI, ratedCount, rateableCount } = input;
	if (stage === STAGE_DECIDED) return { key: 'stageCue.over' };
	if (isHalted) return { key: 'stageCue.closed' };

	const name =
		stage === STAGE_VOTING || (canRate && usesVotingUI)
			? votingCueName(input)
			: ratingCueName(input);
	const isCounting = name === 'moreToRate' || name === 'moreToRateAdd';

	return {
		key: `stageCue.${name}`,
		...(isCounting ? { value: String(rateableCount - ratedCount) } : {}),
	};
}

/** How many of these answers the viewer rated (their own evaluation rows). */
export function countRated(
	evaluations: ReadonlyArray<{ statementId: string; evaluatorId?: string }>,
	answerIds: readonly string[],
	userId: string | undefined,
): number {
	if (!userId) return 0;
	const ids = new Set(answerIds);
	const rated = new Set(
		evaluations
			.filter((e) => e.evaluatorId === userId && ids.has(e.statementId))
			.map((e) => e.statementId),
	);

	return rated.size;
}
