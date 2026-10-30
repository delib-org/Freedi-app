/**
 * Contract of the `rebuildThemes` callable ("Re-theme with AI").
 *
 * Preview runs discovery + assignment and stores a proposal; apply writes the
 * stored proposal (by runId) to the question's theme layer.
 */

export type ThemeRebuildMode = 'preview' | 'apply';

/** Value written to `Statement.themeSource` by the rebuild. */
export const THEME_SOURCE_LLM_REBUILD = 'llm-rebuild';

export interface ThemeRebuildRequest {
	questionId: string;
	mode: ThemeRebuildMode;
	/** Required when mode is 'apply': the runId a preview returned. */
	runId?: string;
}

export interface ThemeRebuildPreviewTheme {
	key: string;
	name: string;
	/** One-line inclusion criterion. */
	rule: string;
	memberCount: number;
	/** Up to 3 member titles. */
	sampleTitles: string[];
	/** Existing theme doc this theme will update (member-Jaccard ≥ 0.5). */
	reusesThemeId?: string;
}

export interface ThemeRebuildPreviewResponse {
	runId: string;
	atomCount: number;
	/** Atoms no theme claimed; shown under "Other ideas". */
	otherCount: number;
	themes: ThemeRebuildPreviewTheme[];
}

export interface ThemeRebuildApplyResponse {
	runId: string;
	themesWritten: number;
	themesHidden: number;
	atomsPlaced: number;
	atomsToOther: number;
	/** Atoms that appeared after the preview; left for the live filing sweep. */
	lateArrivalsToOther: number;
}

export type ThemeRebuildResponse = ThemeRebuildPreviewResponse | ThemeRebuildApplyResponse;

/** `details.reason` of a 'failed-precondition' HttpsError from rebuildThemes. */
export type ThemeRebuildFailureReason = 'no-atoms' | 'proposal-expired' | 'proposal-not-found';
