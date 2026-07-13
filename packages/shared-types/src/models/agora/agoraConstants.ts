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
	/** bridgingScore >= this awards the bridging credit (once per proposal) */
	CREDIT_THRESHOLD: 60,
} as const;

export const AGORA_CAMP_BOUNDS = {
	/** campPosition (0-100) below this → left camp */
	LEFT_MAX: 40,
	/** campPosition (0-100) above this → right camp; between → center */
	RIGHT_MIN: 60,
} as const;

export const AGORA_SESSION = {
	JOIN_CODE_LENGTH: 6,
	/** Characters used for join codes — no ambiguous 0/O/1/I */
	JOIN_CODE_ALPHABET: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
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
	PROPOSAL_SUBMITTED: 5,
	BRIDGING_BONUS: 15,
	SUGGESTION_ACCEPTED: 10,
	SUGGESTION_THANKED: 5,
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
