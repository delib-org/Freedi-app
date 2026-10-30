/**
 * Tunables of the admin "Re-theme with AI" batch rebuild.
 *
 * The rebuild sees the whole question at once, which is what the live filing
 * judge (one proposal at a time) cannot: on the accuracy benchmark the batch
 * LLM reached topic F1 0.80-0.96 against 0.71-0.78 live.
 */

/** Atoms sent to the assignment model per call. */
export const ASSIGN_BATCH_SIZE = 40;

/** Atoms per call when re-asking the ones a batch left out. */
export const RETRY_BATCH_SIZE = 10;

/** Concurrent assignment calls (the shared LLM limiter caps globally too). */
export const ASSIGN_CONCURRENCY = 5;

/** Upper bound on discovered themes. */
export const MAX_THEMES = 15;

/** Lower bound on discovered themes, relaxed for very small questions. */
export const MIN_THEMES = 5;

/** A new theme reuses an old theme doc when their member-Jaccard is at least this. */
export const REUSE_JACCARD_MIN = 0.5;

/** Atoms considered per question; past this the oldest are kept. */
export const MAX_ATOMS = 3_000;

/** Up to this many atoms go to discovery whole; above it, a stratified sample. */
export const DISCOVERY_WHOLE_INPUT_MAX = 1_500;

/** How long a preview can be applied. */
export const PROPOSAL_TTL_MS = 24 * 60 * 60 * 1000;

/** A rebuild lease outlives the callable's 540 s timeout, so a crash frees it. */
export const LEASE_TTL_MS = 10 * 60 * 1000;

/** Characters of description shown with each atom's title. */
export const ATOM_DESCRIPTION_CHARS = 160;

/** Member titles returned per theme in the preview. */
export const SAMPLE_TITLES_PER_THEME = 3;

/** The assignment answer for "fits no theme": the atom goes to "Other ideas". */
export const NONE_KEY = 'NONE';

/** Lease doc `{questionId}` and its `proposals/{runId}` sub-collection. */
export const REBUILD_COLLECTION = '_themeRebuild';
export const PROPOSALS_SUBCOLLECTION = 'proposals';

/**
 * Judge-once state of the live theme sweeps, keyed by question. Cleared after a
 * rebuild so the sweeps judge the new theme list instead of skipping it.
 */
export const LIVE_THEME_STATE_COLLECTIONS = [
	'_liveSynthThemeFile',
	'_liveSynthThemeSplit',
	'_liveSynthThemeSweep',
] as const;

/** Firestore's per-batch write limit, for the hides. */
export const FIRESTORE_BATCH_LIMIT = 500;

export const DISCOVERY_MAX_TOKENS = 4_096;
export const ASSIGN_MAX_TOKENS = 2_048;
