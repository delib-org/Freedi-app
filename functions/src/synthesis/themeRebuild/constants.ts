/**
 * Tunables of the admin "Re-theme with AI" batch rebuild.
 *
 * The rebuild sees the whole question at once, which is what the live filing
 * judge (one proposal at a time) cannot: on the accuracy benchmark the batch
 * LLM reached topic F1 0.80-0.96 against 0.71-0.78 live.
 */

/** Atoms sent to the assignment model per call. */
export const ASSIGN_BATCH_SIZE = 40;

/**
 * Retry rounds for atoms a batch left without a valid answer (missing, unknown
 * id, unknown key, or a failed call). Each round halves the batch size:
 * 40 → 20 → 10 → 5. Only atoms still unanswered after the last round go to
 * "Other ideas", and they are counted apart from NONE answers.
 */
export const ASSIGN_RETRY_ROUNDS = 3;

/** Smallest retry batch; halving stops here. */
export const MIN_RETRY_BATCH_SIZE = 5;

/** Batch size of retry round `round` (1-based): ASSIGN_BATCH_SIZE halved `round` times, floored at MIN_RETRY_BATCH_SIZE. */
export function retryBatchSize(round: number): number {
	return Math.max(MIN_RETRY_BATCH_SIZE, Math.floor(ASSIGN_BATCH_SIZE / 2 ** round));
}

/** Concurrent assignment calls (the shared LLM limiter caps globally too). */
export const ASSIGN_CONCURRENCY = 5;

/** Hard upper bound on discovered themes, for any question size. */
export const MAX_THEMES = 15;

/** Lower bound on discovered themes, relaxed for very small questions. */
export const MIN_THEMES = 5;

/**
 * Atoms per theme the ceiling is scaled by. A fixed ceiling of 15 let
 * discovery split ~50-atom questions into 1-2 member sub-themes (offline gate
 * 2026-10-30: 15 themes against 10 true topics on a Hebrew benchmark state).
 */
export const ATOMS_PER_THEME_CEILING = 4;

/** Theme ceiling for a question: round(atoms / 4), clamped to [MIN_THEMES, MAX_THEMES]. */
export function maxThemesFor(atomCount: number): number {
	const scaled = Math.round(atomCount / ATOMS_PER_THEME_CEILING);

	return Math.min(MAX_THEMES, Math.max(MIN_THEMES, scaled));
}

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
