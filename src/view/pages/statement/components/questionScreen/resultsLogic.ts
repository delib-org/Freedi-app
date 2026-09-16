import { CutoffBy, ResultsSettings, Statement, defaultResultsSettings } from '@freedi/shared-types';
import { getConsensusScore } from '@/redux/utils/selectorFactories';
import { QuestionStageIndex, STAGE_COLLECTING, STAGE_DECIDED } from './questionStage';

/**
 * Pure decisions behind the Results tab and the answers counter: who may read
 * results right now, which answers count as "leading" under the question's own
 * results selection, and the one-line hint above the answers list.
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
			value: String(cutoffNumber),
		};
	}
	if (cutoffBy === CutoffBy.all) return { key: 'Every rated answer, by agreement' };

	return {
		key: decided ? 'By consensus · top {n}' : 'Top {n} by agreement',
		value: String(numberOfResults),
	};
}

export type ScoreTone = 'positive' | 'split' | 'negative';

/** Same bands as the design's bar colour: broad/partial agreement, split, opposition. */
export const SCORE_POSITIVE_MIN = 0.3;
export const SCORE_SPLIT_MIN = -0.1;

export function scoreTone(score: number): ScoreTone {
	if (score >= SCORE_POSITIVE_MIN) return 'positive';
	if (score > SCORE_SPLIT_MIN) return 'split';

	return 'negative';
}

export const SCORE_BROAD_MIN = 0.6;

/** The design's plain-language label for a score (broad / partial agreement, split, opposition). */
export function scoreLabelKey(score: number): string {
	if (score >= SCORE_BROAD_MIN) return 'Broad agreement';
	if (score >= SCORE_POSITIVE_MIN) return 'Partial agreement';
	if (score > SCORE_SPLIT_MIN) return 'Split';

	return 'Opposition';
}

/** A −1…1 score as a 0…100 bar width. */
export function scorePercent(score: number): number {
	const clamped = Math.max(-1, Math.min(1, score));

	return Math.round(((clamped + 1) / 2) * 100);
}

export interface RateHintInput {
	canRate: boolean;
	stage: QuestionStageIndex;
	rated: number;
	total: number;
}

/** The hint beside the "{rated}/{total}" counter above the answers list. */
export function getRateHint({ canRate, stage, rated, total }: RateHintInput): Caption {
	if (!canRate) {
		return {
			key:
				stage === STAGE_COLLECTING
					? 'Still collecting ideas — rating opens later'
					: 'Rating is closed',
		};
	}
	if (rated === 0) return { key: 'Rate each answer on its own — what could you live with?' };
	if (rated < total) return { key: '{n} more to rate', value: String(total - rated) };

	return { key: 'You rated them all. Thank you!' };
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
