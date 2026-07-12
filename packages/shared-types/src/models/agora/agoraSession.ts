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
} from './agoraEnums';

export const AgoraHealthMetricOutcomeSchema = object({
	metricId: string(),
	value: number(),
	/** Short AI-written narrative of what happens to this metric */
	narrative: string(),
});

export type AgoraHealthMetricOutcome = InferOutput<typeof AgoraHealthMetricOutcomeSchema>;

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
