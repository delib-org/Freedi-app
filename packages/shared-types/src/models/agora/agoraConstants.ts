/**
 * Agora game constants. Kept in shared-types so the client can render
 * transparent "why you scored X" explanations with the exact same numbers
 * the Cloud Functions use.
 */

export const AGORA_BRIDGING = {
	/** Weight of support from the author's own camp */
	SAME_CAMP_WEIGHT: 0.35,
	/** Weight of support from the opposite camp (bridging is worth more) */
	CROSS_CAMP_WEIGHT: 0.65,
	/** Center-camp raters count toward both camps at this weight */
	CENTER_CAMP_WEIGHT: 0.5,
	/** Cross-camp confidence saturates after this many cross-camp raters */
	MIN_CROSS_RATERS: 3,
	/**
	 * bridgingScore >= this awards the FULL bridging credit (tier 2).
	 * Kept as the historical name so existing reads stay correct.
	 *
	 * Was 60, and it means the same thing it always did. The support term
	 * stopped clipping the against half of the scale and now MAPS it
	 * (-1 → 0, 0 → 0.5, +1 → 1, see `warmth` in agoraBridging), so every
	 * reading shifted up the scale and the bar had to shift with it or the
	 * credit would have quietly become cheaper. Both camps at a mean of +0.6
	 * scored 60 under the old term and score 80 under this one, so 80 is the
	 * same class sentiment written in the new units.
	 */
	CREDIT_THRESHOLD: 80,
	/**
	 * First rung of the bridging ladder. A cliff at the top means most authors
	 * never feel the mechanic at all, so the credit is graduated: this is the
	 * "you reached across" moment, CREDIT_THRESHOLD the full bridge. Re-pointed
	 * from 40 by the same arithmetic — both camps at a mean of +0.4.
	 *
	 * Still self-guarding, and with more room than before: own-camp support
	 * alone maxes the score at 35 (SAME_CAMP_WEIGHT × 100), so tier 1 is
	 * geometrically unreachable without reaching across. A class that is
	 * merely indifferent — every camp at a mean of 0 — now reads 50, which is
	 * deliberately below this line: shrugging is not bridging.
	 */
	CREDIT_THRESHOLD_TIER_1: 70,
} as const;

export const AGORA_CAMP_BOUNDS = {
	/** campPosition (0-100) below this → left camp */
	LEFT_MAX: 40,
	/** campPosition (0-100) above this → right camp; between → center */
	RIGHT_MIN: 60,
} as const;

export const AGORA_SESSION = {
	JOIN_CODE_LENGTH: 5,
	/**
	 * Digits only. Students type this off the board on a phone, so a numeric
	 * keypad beats a full keyboard — and with no letters there is nothing left
	 * to confuse (the old alphabet had to drop O/0 and I/1 by hand).
	 * 10^5 = 100,000 codes, checked for collisions against open/live sessions
	 * only, so the space is far larger than the number of concurrent classes.
	 */
	JOIN_CODE_ALPHABET: '0123456789',
	/**
	 * A newly minted code must not collide with any session created inside this
	 * window. Scoping by age rather than by status means a code stays reserved
	 * for a full day even after its lesson ends — so a student who kept
	 * yesterday's code on a note cannot wander into today's unrelated class.
	 */
	JOIN_CODE_UNIQUE_WINDOW_MS: 24 * 60 * 60 * 1000,
	TEAM_SIZE_MIN: 1,
	TEAM_SIZE_MAX: 3,
	/** Default lesson length in milliseconds (45 minutes) */
	DEFAULT_LESSON_MS: 45 * 60 * 1000,
	/** Default round length in milliseconds (8 minutes) */
	DEFAULT_ROUND_MS: 8 * 60 * 1000,
	/** Class score at or above this threshold → success ending */
	SUCCESS_THRESHOLD: 70,
} as const;

export const AGORA_POINTS = {
	VALUE_ACCURACY_MAX: 20,
	/**
	 * Awarded ONCE, on the student's first proposal (server-side, from the
	 * statement-created trigger). Writing the first draft is the steepest
	 * step of the funnel and used to earn nothing at all. Deliberately below
	 * a landed idea (+3): showing up must never outpay helping someone.
	 */
	PROPOSAL_SUBMITTED: 3,
	/**
	 * The improvement cycle (docs: apps/agora/docs/feedback-cycle.md):
	 * accept is the promise (+1), woven-in is the promise kept (+2), so a
	 * landed idea earns +3 total — the reward leans toward ideas that end
	 * up IN the text. Balances floor at 0.
	 */
	SUGGESTION_ACCEPTED: 1,
	SUGGESTION_IMPLEMENTED: 2,
	/**
	 * Declining costs the helper NOTHING. A penalty here was regressive: the
	 * floor at 0 exempted the spammer with an empty balance and taxed only
	 * the productive helper who had points to lose. Spam is bounded
	 * structurally instead — see MAX_OPEN_SUGGESTIONS_PER_HELPER below.
	 * The quiet toast stays: silence is worse than cost.
	 */
	SUGGESTION_DECLINED: 0,
	/**
	 * The author's ONE positive answer to an improvement idea, since the
	 * places UI retired the accept → weave chain (2026-08-09): saying thank
	 * you is what pays the classmate who helped. Priced at the old accept
	 * rung (+1) rather than the old polite-nod rate (0.5) — it now carries
	 * the whole helping side of the economy. Bounded by construction: only a
	 * helper's FIRST message on a proposal is suggestion-kind, so one
	 * classmate's proposal can thank one helper exactly once.
	 */
	SUGGESTION_THANKED: 1,
	/**
	 * The author's side of the cycle. Weaving someone's idea into the text
	 * is real editorial labor and used to be unpaid. Credited per DISTINCT
	 * helper so integrating many voices beats trading rounds with one buddy —
	 * the incentive is bridging-shaped by construction.
	 */
	WEAVE_CREDIT_PER_HELPER: 1,
	MAX_WEAVE_CREDITS_PER_PROPOSAL: 3,
	/**
	 * Evaluating classmates' proposals is the commons the whole game runs on
	 * (bridging confidence, rater coverage) and earned nothing. Value-blind —
	 * the credit is identical for "strongly against" and "strongly for", so
	 * there is no incentive to rate in any direction. First rating of a given
	 * proposal only; the deterministic evaluation id dedupes re-rating.
	 */
	RATING_CREDIT: 0.5,
	/** Credited ratings per student (≈ ROUNDS × RATINGS_PER_ROUND) */
	RATING_CREDIT_MAX_RATINGS: 15,
	/**
	 * Revising your own proposal after the class has spoken. The only verb of
	 * the improvement loop that paid nothing — writing, rating and helping all
	 * earn, and students read that asymmetry as "revision doesn't count".
	 * Gated hard (see AGORA_ANTI_GAMING): the edit must follow NEW feedback
	 * and really change the text, so the credit rewards listening, not saving.
	 * Priced at parity with a landed idea (+1) and below the first draft.
	 */
	REVISION_CREDIT: 1,
	/** Credited revisions per proposal (one proposal per student → per session) */
	MAX_REVISION_CREDITS: 3,
	/**
	 * The bridging ladder, graduated. Total still 15 for a full bridge;
	 * tier 1 turns a cliff most authors never reach into a gradient.
	 */
	BRIDGING_BONUS_TIER_1: 5,
	BRIDGING_BONUS_TIER_2: 10,
	/** Full-bridge total, kept for reporting/back-compat reads */
	BRIDGING_BONUS: 15,
	/**
	 * A challenge written during the vote survived the class re-vote and took
	 * a seat on the ballot. Priced at parity with the first draft (+3): it is
	 * the same act of writing, only judged in public. Passing costs nothing
	 * and failing costs nothing — the rotation reaches everyone, so a penalty
	 * would tax the students who tried, and pitching alone pays nothing,
	 * because in a fixed rotation everyone pitches and a fee for showing up
	 * is a fee nobody has to earn.
	 */
	CHALLENGE_SURVIVED: 3,
} as const;

export const AGORA_ANTI_GAMING = {
	/**
	 * Open (unresolved) suggestions one helper may have on one proposal.
	 * This is the real spam guard — it binds on the spammer regardless of
	 * balance, unlike a points penalty. Resolved ideas free the slot, so a
	 * genuinely helpful student is never blocked for long.
	 */
	MAX_OPEN_SUGGESTIONS_PER_HELPER: 2,
	/**
	 * Woven awards one helper can earn on ONE proposal. Bounds the
	 * accept-and-weave collusion loop (A and B trading +3 rounds forever)
	 * without any surveillance: past the cap the celebration still fires —
	 * recognition is decoupled from currency — but the points do not.
	 */
	MAX_WOVEN_AWARDS_PER_HELPER_PER_PROPOSAL: 2,
	/**
	 * A save must change at least this many words (added + removed, vs the
	 * previous text) to count as a revision at all. Below it the save is
	 * cosmetic — still saved, still shown, just not an event.
	 */
	MIN_REVISION_DELTA_WORDS: 3,
	/**
	 * Saves closer together than this collapse into ONE revision event for
	 * history and celebration purposes. A student polishing a sentence in five
	 * quick saves made one revision, not five — and a farmer clicking save
	 * gets nothing to farm.
	 */
	REVISION_DEBOUNCE_MS: 3 * 60 * 1000,
	/**
	 * Edit-history entries kept per proposal (the v1→vN journey). Enough for
	 * every honest lap of a 45-minute lesson; a cap so a pathological save
	 * loop cannot grow the score doc without bound.
	 */
	EDIT_HISTORY_MAX: 10,
} as const;

export const AGORA_CYCLE = {
	/** Personal deliberation rounds per student: my proposal → rate others → help someone */
	ROUNDS: 5,
	/** Ratings asked of the student in each cycle round */
	RATINGS_PER_ROUND: 3,
	/** The deliberation-stage fuse set when the teacher opens the square */
	DELIBERATION_TOTAL_MS: 20 * 60 * 1000,
} as const;

export const AGORA_AI_REVIEW = {
	/** Each character's verdict counts as this many raters in the evaluation pipeline */
	RATERS_PER_CHARACTER: 3,
	/** In-character review requests allowed per character per proposal per (server) round — the
	 * personal-cycle deliberation keeps one server round, so effectively per session */
	MAX_ASKS_PER_CHARACTER_PER_ROUND: 5,
	/** campPosition assigned to the left character's AI rater identities */
	LEFT_CAMP_POSITION: 10,
	/** campPosition assigned to the right character's AI rater identities */
	RIGHT_CAMP_POSITION: 90,
	/** Prefix of synthetic AI rater uids — used to exclude them from student-only metrics */
	AI_UID_PREFIX: 'agora-ai--',
} as const;

export const AGORA_OUTCOME = {
	/** ≥ this many proposals rated by BOTH wing camps (students only) counts as mapped divergence */
	MIN_CROSS_RATED_PROPOSALS: 2,
	/** ≥ this share of positioned students rated at least one proposal */
	MIN_RATER_COVERAGE: 0.5,
} as const;

export const AGORA_VOTING = {
	/** Proposals that reach the ballot when the teacher changes nothing */
	DEFAULT_TOP_X: 3,
	/** A ballot of one is not an election */
	MIN_TOP_X: 2,
	MAX_TOP_X: 10,
	/** Consensus a proposal must beat to reach the ballot in threshold mode */
	DEFAULT_CUTOFF_CP: 0.5,
} as const;

export const AGORA_CHALLENGE = {
	/**
	 * Turns the challenge round runs before it closes itself.
	 *
	 * The rotation is the whole class, in seat order — but a turn costs about
	 * a minute and a half once the teacher has opened the floor, a student has
	 * written something real, and thirty phones have moved a vote. A class of
	 * twenty-five would spend the rest of the lesson on it. The round therefore
	 * ends after this many turns unless the teacher raises it, and the teacher's
	 * card shows what the current pace implies before the lesson runs out.
	 */
	DEFAULT_MAX_TURNS: 8,
	MIN_MAX_TURNS: 1,
	MAX_TURNS_CEILING: 40,
} as const;

export const AGORA_LIMITS = {
	MIN_ANSWER_LENGTH: 10,
	MAX_ANSWER_LENGTH: 1000,
	MIN_PROPOSAL_LENGTH: 10,
	MAX_PROPOSAL_LENGTH: 1500,
	MAX_VIDEO_BYTES: 300 * 1024 * 1024,
	MAX_IMAGE_BYTES: 5 * 1024 * 1024,
	/** Proposals shown per rating batch */
	RATING_BATCH_SIZE: 5,
} as const;
