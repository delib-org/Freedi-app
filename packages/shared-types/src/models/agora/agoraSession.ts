import {
	object,
	string,
	number,
	boolean,
	optional,
	array,
	record,
	enum_,
	InferOutput,
} from 'valibot';
import { VotingStageSettingsSchema, VotingStateSchema } from '../vote/votingStageSettings';
import {
	AgoraStage,
	AgoraRoundPhase,
	AgoraDeviceMode,
	AgoraSessionMode,
	AgoraSessionStatus,
	AgoraSessionOutcome,
} from './agoraEnums';

/**
 * What an Odyssey island opened this session for. Present only on civic
 * sessions; it is the whole link back to the island, because the deliberation
 * gets its own statement tree (Agora proposals must never surface as stances
 * on the island's Voyage screen).
 */
export const AgoraCivicOriginSchema = object({
	odysseyGameId: string(),
	/** statementId of the island's `question` Statement in Odyssey */
	islandStatementId: string(),
	/** The two stances used as poles when deriving a participant's camp */
	leftAnchorStanceId: optional(string()),
	rightAnchorStanceId: optional(string()),
});

export type AgoraCivicOrigin = InferOutput<typeof AgoraCivicOriginSchema>;

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
	/**
	 * The consensus term of the class score, 0-100 — the leading proposal's
	 * class consensus expressed as a fraction of what a class this size could
	 * have reached at its actual coverage. Normalised rather than raw because a
	 * student's rating budget is fixed: coverage falls as the class grows, so
	 * raw consensus would make the same class sentiment pass in a class of six
	 * and be unreachable in a class of forty.
	 *
	 * Falls back to the bridging peak for sessions scored before class
	 * consensus existed.
	 */
	maxConsensus: number(),
	/** The proposal the class agreed on most — the one the results screen names */
	leadStatementId: optional(string()),
	/** That proposal's raw class consensus, -1..1. At a census this is the plain mean. */
	leadConsensus: optional(number()),
	/** How much of the class actually rated the leading proposal */
	leadCoverage: optional(
		object({
			rated: number(),
			eligible: number(),
		}),
	),
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
	/**
	 * The proposal the class ELECTED, when a voting stage was held. Present
	 * regardless of whether it cleared `winningConsensusThreshold` — the
	 * results screen needs to name it either way.
	 */
	voteWinnerStatementId: optional(string()),
	/** Votes per proposal, counted from the votes collection at results time */
	voteCounts: optional(record(string(), number())),
	voteTotal: optional(number()),
	/** False when the most-voted proposal did not clear the teacher's win threshold */
	voteWinnerMetThreshold: optional(boolean()),
	/** The threshold that was applied, echoed so the screen can show the gap */
	winningConsensusThreshold: optional(number()),
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
	/**
	 * Which track this session runs. Absent on every classroom session ever
	 * written, and `undefined` means `classroom` — see AgoraSessionMode.
	 */
	sessionMode: optional(enum_(AgoraSessionMode)),
	/** Set only on civic sessions: the Odyssey island this deliberation belongs to */
	civic: optional(AgoraCivicOriginSchema),
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
	/**
	 * How the vote is run. Teacher-writable (see firestore.rules); absent
	 * means the defaults in `resolveVotingSelection`.
	 */
	votingSettings: optional(VotingStageSettingsSchema),
	/**
	 * The ballot, written server-side when the voting stage opens and frozen by
	 * rules thereafter. Clients read candidates from HERE and never from the
	 * parent's `results`, which later ratings keep rewriting.
	 */
	voting: optional(VotingStateSchema),
	createdAt: number(),
	lastUpdate: number(),
});

export type AgoraSession = InferOutput<typeof AgoraSessionSchema>;
