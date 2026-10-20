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
