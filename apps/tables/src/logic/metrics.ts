import type { TableAssignmentMetrics } from '@freedi/shared-types';

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
}

/** The choice counts the preview prints. A published run has none: every count is then zero. */
export function describeMetrics(metrics: TableAssignmentMetrics): MetricsView {
	const { preferences } = metrics;
	const rankRows = preferences.byRank.map((count, index) => ({ rank: index + 1, count }));
	const gotChosenTopic = preferences.byRank.reduce((sum, count) => sum + count, 0);

	return {
		rankRows,
		outsideChoices: preferences.none,
		withoutPreferences: preferences.noPreference,
		gotChosenTopic,
		rankedSeated: gotChosenTopic + preferences.none,
	};
}
