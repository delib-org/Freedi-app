/**
 * Pure selection rules for a question's chosen (top) options.
 *
 * Given every option of a question and the question's resultsSettings, decide
 * which options are chosen and in which order. No Firestore access here: the
 * caller loads the options and applies the diff. Hidden options (e.g. merged
 * source statements, originals integrated into a synthesized cluster) never
 * enter the selection - their votes already live on the cluster.
 */

import { logger } from 'firebase-functions/v1';
import {
	Statement,
	SimpleStatement,
	ResultsSettings,
	ResultsBy,
	CutoffBy,
} from '@freedi/shared-types';

/** Number of top options when resultsSettings.numberOfResults is not set. */
export const DEFAULT_NUMBER_OF_RESULTS = 5;

export function getEvaluationValue(statement: Statement, resultsBy: ResultsBy): number {
	switch (resultsBy) {
		case ResultsBy.consensus:
		case ResultsBy.topOptions:
			return statement.consensus ?? 0;
		case ResultsBy.mostLiked:
			return statement.evaluation?.sumPro ?? 0;
		case ResultsBy.averageLikesDislikes:
			return statement.evaluation?.sumEvaluations ?? 0;
		default:
			return statement.consensus ?? 0;
	}
}

function sortOptionsByResultsBy(options: Statement[], resultsBy: ResultsBy): Statement[] {
	return [...options].sort(
		(a, b) => getEvaluationValue(b, resultsBy) - getEvaluationValue(a, resultsBy),
	);
}

/** Final ordering of the selected options (stable sort, so ties keep input order). */
export function getSortedOptions(
	statements: Statement[],
	resultsSettings: ResultsSettings,
): Statement[] {
	const { resultsBy } = resultsSettings;

	const sortComparisons = {
		[ResultsBy.consensus]: (a: Statement, b: Statement) => (b.consensus ?? 0) - (a.consensus ?? 0),
		[ResultsBy.mostLiked]: (a: Statement, b: Statement) =>
			(b.evaluation?.sumPro ?? 0) - (a.evaluation?.sumPro ?? 0),
		[ResultsBy.averageLikesDislikes]: (a: Statement, b: Statement) =>
			(b.evaluation?.sumEvaluations ?? 0) - (a.evaluation?.sumEvaluations ?? 0),
		[ResultsBy.topOptions]: (a: Statement, b: Statement) => (b.consensus ?? 0) - (a.consensus ?? 0),
	};

	return statements.sort(sortComparisons[resultsBy] || sortComparisons[ResultsBy.consensus]);
}

/**
 * Applies the cutoff mode to the question's options (unsorted, hidden included).
 * Returns undefined for an unknown cutoff mode.
 */
export function getOptionsUsingMethod(
	allOptions: Statement[],
	resultsSettings: ResultsSettings,
): Statement[] | undefined {
	const { numberOfResults, resultsBy, cutoffBy, cutoffNumber } = resultsSettings;

	// cutoffNumber serves as the minimum threshold (default to 0, meaning no minimum)
	const effectiveCutoffNumber = cutoffNumber ?? 0;
	const effectiveCutoffBy = cutoffBy || CutoffBy.topOptions;

	if (allOptions.length === 0) return [];

	// Exclude hidden options (merged sources, originals integrated into a cluster).
	const visible = allOptions.filter((opt) => !opt.hide);

	if (effectiveCutoffBy === CutoffBy.topOptions) {
		const effectiveNumberOfResults = numberOfResults || DEFAULT_NUMBER_OF_RESULTS;

		// Top N by the chosen metric, regardless of their values (no cutoff filtering).
		return sortOptionsByResultsBy(visible, resultsBy).slice(
			0,
			Math.ceil(Number(effectiveNumberOfResults)),
		);
	}

	if (effectiveCutoffBy === CutoffBy.aboveThreshold) {
		return visible.filter((opt) => getEvaluationValue(opt, resultsBy) > effectiveCutoffNumber);
	}

	if (effectiveCutoffBy === CutoffBy.all) {
		// No cutoff: every visible option, still ranked by the chosen metric
		return sortOptionsByResultsBy(visible, resultsBy);
	}

	logger.warn(`getOptionsUsingMethod: Unknown cutoffBy value: ${effectiveCutoffBy}`);

	return undefined;
}

/** The chosen options, in display order. Empty when nothing qualifies. */
export function selectChosenOptions(
	allOptions: Statement[],
	resultsSettings: ResultsSettings,
): Statement[] {
	const candidates = getOptionsUsingMethod(allOptions, resultsSettings);
	if (!candidates?.length) return [];

	return getSortedOptions(candidates, resultsSettings);
}

// ----------------------------------------------------------------------------
// Which options must be read to make the selection
// ----------------------------------------------------------------------------

/**
 * What the selection needs from the consensus-ordered query, or undefined when
 * only a read of every option gives the right answer: ordering by another
 * metric (no descending index for it) or a cutoff that keeps everything.
 */
export type CandidatePlan = { top: number } | { above: number };

export function planCandidates(settings: ResultsSettings): CandidatePlan | undefined {
	const orderedByConsensus =
		settings.resultsBy === ResultsBy.consensus || settings.resultsBy === ResultsBy.topOptions;
	if (!orderedByConsensus) return undefined;

	const cutoffBy = settings.cutoffBy || CutoffBy.topOptions;
	if (cutoffBy === CutoffBy.aboveThreshold) {
		const above = settings.cutoffNumber ?? 0;

		// A negative threshold also admits options with no consensus field (see below).
		return above >= 0 ? { above } : undefined;
	}
	if (cutoffBy !== CutoffBy.topOptions) return undefined;

	const top = Math.ceil(Number(settings.numberOfResults || DEFAULT_NUMBER_OF_RESULTS));

	return Number.isFinite(top) && top > 0 ? { top } : undefined;
}

export type CandidateStatus = 'complete' | 'readMore' | 'readAll';

/**
 * Whether `fetched` (consensus descending) holds every option the selection
 * could pick.
 *
 * - A hidden option can sit anywhere in the order, so only visible ones count
 *   toward the top N.
 * - Options tied with last place must all be read, or the tie would be decided
 *   by which page they fell on.
 * - Options without a consensus field are not returned by the query and rank
 *   as 0. They cannot reach a last place above 0; at or below 0 only a full
 *   read gives the right answer.
 *
 * `exhausted` means the query has no more options to return.
 */
export function candidateStatus(
	fetched: Statement[],
	plan: CandidatePlan,
	exhausted: boolean,
): CandidateStatus {
	const lastConsensus = fetched[fetched.length - 1]?.consensus ?? 0;

	if ('above' in plan) {
		return exhausted || lastConsensus <= plan.above ? 'complete' : 'readMore';
	}

	const lastPlace = fetched.filter((option) => !option.hide)[plan.top - 1];
	if (!lastPlace) return exhausted ? 'readAll' : 'readMore';

	const lastPlaceConsensus = lastPlace.consensus ?? 0;
	if (lastPlaceConsensus <= 0) return 'readAll';

	return exhausted || lastConsensus < lastPlaceConsensus ? 'complete' : 'readMore';
}

// ----------------------------------------------------------------------------
// Diffing against what is stored
// ----------------------------------------------------------------------------

export interface ChosenDiff {
	/** Currently flagged isChosen but no longer selected. */
	toUnchoose: string[];
	/** Selected but not flagged isChosen yet. */
	toChoose: string[];
}

export function diffChosen(currentlyChosenIds: string[], nextChosen: Statement[]): ChosenDiff {
	const current = new Set(currentlyChosenIds);
	const next = new Set(nextChosen.map((option) => option.statementId));

	return {
		toUnchoose: currentlyChosenIds.filter((id) => !next.has(id)),
		toChoose: nextChosen.map((option) => option.statementId).filter((id) => !current.has(id)),
	};
}

function stableSerialize(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
	if (value && typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>)
			.filter(([, v]) => v !== undefined)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
			.map(([k, v]) => `${JSON.stringify(k)}:${stableSerialize(v)}`);

		return `{${entries.join(',')}}`;
	}

	return JSON.stringify(value) ?? 'null';
}

/**
 * True when the question's stored `results` / `totalResults` already equal the
 * next ones: same options, same order, same fields. `lastUpdate` of a copied
 * option is ignored: it moves on every vote and no surface reads it from the
 * copy, so comparing it would defeat the purpose.
 */
export function resultsUnchanged(
	stored: { results?: SimpleStatement[]; totalResults?: number },
	next: SimpleStatement[],
): boolean {
	const storedResults = stored.results ?? [];
	if (storedResults.length !== next.length) return false;
	if ((stored.totalResults ?? 0) !== next.length) return false;
	if (stored.results === undefined && next.length === 0 && stored.totalResults === undefined) {
		return false; // legacy parent never had the fields: write once so they exist
	}

	const strip = (s: SimpleStatement): unknown => ({ ...s, lastUpdate: undefined });

	return stableSerialize(storedResults.map(strip)) === stableSerialize(next.map(strip));
}
