import {
	object,
	string,
	number,
	boolean,
	optional,
	array,
	enum_,
	InferOutput,
} from 'valibot';
import {
	AgoraStage,
	AgoraRoundPhase,
	AgoraDeviceMode,
	AgoraSessionStatus,
	AgoraSessionOutcome,
} from './agoraEnums';

export const AgoraHealthMetricOutcomeSchema = object({
	metricId: string(),
	value: number(),
	/** Short AI-written narrative of what happens to this metric */
	narrative: string(),
});

export type AgoraHealthMetricOutcome = InferOutput<typeof AgoraHealthMetricOutcomeSchema>;

/** Warm, formative class debrief — "each failure is the empirical learning it paid for" */
export const AgoraDebriefSchema = object({
	whatWentWell: array(string()),
	whatToTryNextTime: array(string()),
	encouragement: string(),
});

export type AgoraDebrief = InferOutput<typeof AgoraDebriefSchema>;

export const AgoraOutcomeStatsSchema = object({
	/** Proposals rated by both wing camps (students only) */
	crossRatedProposals: number(),
	/** Distinct student raters / positioned students, 0..1 */
	raterCoverage: number(),
});

export type AgoraOutcomeStats = InferOutput<typeof AgoraOutcomeStatsSchema>;

export const AgoraClassScoreSchema = object({
	/** Highest agreementIndex reached by any proposal, 0-100 */
	maxConsensus: number(),
	/** Sum of all participants' personal points */
	personalPointsSum: number(),
	/** Average AI plausibility score across proposals, 0-100 */
	avgPlausibility: number(),
	/** Combined class score, 0-100 */
	total: number(),
	/** Threshold that was applied (from AGORA_SESSION.SUCCESS_THRESHOLD or session override) */
	threshold: number(),
	success: boolean(),
	/** Three-way outcome; optional for sessions computed before it existed (fall back on `success`) */
	outcome: optional(enum_(AgoraSessionOutcome)),
	outcomeStats: optional(AgoraOutcomeStatsSchema),
	/** AI-written formative debrief, always warm — fuller card shown on non-success */
	debrief: optional(AgoraDebriefSchema),
	healthMetricOutcomes: array(AgoraHealthMetricOutcomeSchema),
	computedAt: number(),
});

export type AgoraClassScore = InferOutput<typeof AgoraClassScoreSchema>;

/**
 * A live classroom session. The session doc is the single source of truth
 * for stage/round state — every participant holds one onSnapshot on it.
 */
export const AgoraSessionSchema = object({
	sessionId: string(),
	/** Short join code students type or scan (QR encodes /join/<code>) */
	code: string(),
	topicPackageId: string(),
	teacherId: string(),
	/** Root question Statement of this session (statements collection) */
	rootStatementId: string(),
	/** Child Statement holding the challenge question — proposals are its options */
	challengeQuestionId: string(),
	deviceMode: enum_(AgoraDeviceMode),
	teamSizeMax: number(),
	stage: enum_(AgoraStage),
	roundNumber: number(),
	roundPhase: optional(enum_(AgoraRoundPhase)),
	/** Millis timestamp when the current round soft-locks (client countdown) */
	roundEndsAt: optional(number()),
	/** Millis timestamp when the lesson ends (sweep auto-ends past this) */
	lessonEndsAt: optional(number()),
	participantCount: number(),
	status: enum_(AgoraSessionStatus),
	classScore: optional(AgoraClassScoreSchema),
	createdAt: number(),
	lastUpdate: number(),
});

export type AgoraSession = InferOutput<typeof AgoraSessionSchema>;
