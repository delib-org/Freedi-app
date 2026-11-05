import type { TableAssignmentMetrics } from '@freedi/shared-types';

const BALANCE_DECIMALS = 2;
const PERCENT = 100;

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
	balanceMax: string;
	balanceMean: string;
	tolerance: string;
	withinTolerance: boolean;
	/** Share of the seated whose seat is one of their choices, 0..100 (rounded). */
	satisfiedPercent: number;
}

export function formatDeviation(value: number): string {
	return Number.isFinite(value) ? value.toFixed(BALANCE_DECIMALS) : '-';
}

/** Turn the run's metrics into the numbers the preview screen prints. */
export function describeMetrics(metrics: TableAssignmentMetrics): MetricsView {
	const { balance, preferences } = metrics;
	const rankRows = preferences.byRank.map((count, index) => ({ rank: index + 1, count }));
	const inChoices = preferences.byRank.reduce((sum, count) => sum + count, 0);
	const seated = inChoices + preferences.none + preferences.noPreference;
	const rankedSeated = seated - preferences.noPreference;

	return {
		rankRows,
		outsideChoices: preferences.none,
		withoutPreferences: preferences.noPreference,
		balanceMax: formatDeviation(balance.max),
		balanceMean: formatDeviation(balance.mean),
		tolerance: formatDeviation(balance.tolerance),
		withinTolerance: balance.withinTolerance,
		satisfiedPercent: rankedSeated > 0 ? Math.round((inChoices / rankedSeated) * PERCENT) : 0,
	};
}
