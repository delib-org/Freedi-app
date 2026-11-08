import type { Statement } from '@freedi/shared-types';

/** One unit the rebuild places: a visible synthesis, or a plain option in no synthesis. */
export interface RebuildAtom {
	id: string;
	title: string;
	/** What the models read: title plus a short description. */
	text: string;
	isSynth: boolean;
}

/** A theme as discovery returns it. `key` is assigned locally (t1, t2, ...). */
export interface DiscoveredTheme {
	key: string;
	name: string;
	/** One-line inclusion criterion. */
	rule: string;
}

export interface ThemeWithMembers extends DiscoveredTheme {
	memberIds: string[];
}

export interface MatchedTheme extends ThemeWithMembers {
	/** Existing theme doc this theme overwrites, when Jaccard ≥ REUSE_JACCARD_MIN. */
	reusesThemeId?: string;
}

export interface HiddenTheme {
	themeId: string;
	/** Key of the new theme with the most overlap; absent when nothing overlaps. */
	mergedIntoKey?: string;
}

export interface MatchResult {
	themes: MatchedTheme[];
	hidden: HiddenTheme[];
}

/** What a question looks like to the rebuild right now. */
export interface QuestionAtoms {
	atoms: RebuildAtom[];
	/** Visible theme docs (topic clusters) under the question. */
	liveThemes: Statement[];
}

/** Stored under `_themeRebuild/{questionId}/proposals/{runId}` by a preview. */
export interface StoredProposal {
	runId: string;
	questionId: string;
	createdBy: string;
	createdAt: number;
	expiresAt: number;
	atomIds: string[];
	themes: ThemeWithMembers[];
	otherIds: string[];
	appliedAt?: number;
}
