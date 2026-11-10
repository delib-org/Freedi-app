import type { TableAssignmentMetrics } from '@freedi/shared-types';

const BALANCE_DECIMALS = 2;

export interface RankRow {
	/** 1 = first choice. */
	rank: number;
	count: number;
}

export interface MetricsView {
	rankRows: RankRow[];
	/** Seated outside their ranked topics. */
	outsideChoices: number;
	/** Seated without having ranked anything. */
	withoutPreferences: number;
	/** Seated at a topic they chose. */
	gotChosenTopic: number;
	/** Everyone seated who ranked something. */
	rankedSeated: number;
	balanceMax: string;
	tolerance: string;
}

export function formatDeviation(value: number): string {
	return Number.isFinite(value) ? value.toFixed(BALANCE_DECIMALS) : '-';
}

/** Turn the run's metrics into the numbers the preview screen prints. */
export function describeMetrics(metrics: TableAssignmentMetrics): MetricsView {
	const { balance, preferences } = metrics;
	const rankRows = preferences.byRank.map((count, index) => ({ rank: index + 1, count }));
	const gotChosenTopic = preferences.byRank.reduce((sum, count) => sum + count, 0);

	return {
		rankRows,
		outsideChoices: preferences.none,
		withoutPreferences: preferences.noPreference,
		gotChosenTopic,
		rankedSeated: gotChosenTopic + preferences.none,
		balanceMax: formatDeviation(balance.max),
		tolerance: formatDeviation(balance.tolerance),
	};
}
