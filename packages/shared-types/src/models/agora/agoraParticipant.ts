import {
	object,
	string,
	number,
	optional,
	array,
	boolean,
	enum_,
	record,
	InferOutput,
} from 'valibot';
import { AgoraCamp, AgoraStage } from './agoraEnums';

export const AgoraValueScoreSchema = object({
	characterId: string(),
	/** AI accuracy score 0-100 for the value-identification answer */
	score: number(),
	feedback: string(),
});

export type AgoraValueScore = InferOutput<typeof AgoraValueScoreSchema>;

export const AgoraPointsSchema = object({
	valueAccuracy: number(),
	proposals: number(),
	helping: number(),
	/**
	 * Credit for evaluating classmates' proposals. Optional because
	 * participants created before the rating credit existed have no such
	 * field — read it as `?? 0`, never assume it is present.
	 */
	rating: optional(number()),
	/**
	 * Credit for revising your own proposal after new feedback
	 * (AGORA_POINTS.REVISION_CREDIT, capped). Optional for the same
	 * legacy-docs reason as `rating` — read as `?? 0`.
	 */
	revising: optional(number()),
	total: number(),
});

export type AgoraPoints = InferOutput<typeof AgoraPointsSchema>;

/**
 * One anonymous participant unit in a session — a single student, or a
 * whole team sharing one device in team mode. Doc id: `${sessionId}--${uid}`.
 */
export const AgoraParticipantSchema = object({
	participantId: string(),
	sessionId: string(),
	userId: string(),
	/** Auto-generated anonymous display name (never a real name) */
	anonName: string(),
	/**
	 * The roster spot behind this participant when the session belongs to a
	 * class (`agoraClassMembers`' stable memberId). Server-written at join;
	 * absent on guest games — career aggregation keys on THIS, never the uid.
	 */
	memberId: optional(string()),
	/** Number of students at this device in team mode */
	teamMemberCount: optional(number()),
	/** Synthetic AI rater identity (in-character reviews) — excluded from counts, points and coverage */
	isAI: optional(boolean()),
	/**
	 * Self-paced progress inside the current scene stage, written by the
	 * student's client — the teacher's "who finished, can I advance?" signal
	 */
	stageProgress: optional(
		object({
			stage: enum_(AgoraStage),
			scenesDone: number(),
			scenesTotal: number(),
		}),
	),
	/** 0 (fully left camp) … 100 (fully right camp) */
	campPosition: optional(number()),
	camp: optional(enum_(AgoraCamp)),
	/**
	 * The island stances as this person rated them ON ARRIVAL — the "before"
	 * half of a convergence score. Snapshotted at join because the ratings
	 * themselves live at deterministic `${uid}--${stanceId}` evaluation ids: a
	 * later re-rate overwrites the original, and without a copy the room's
	 * starting disagreement would be unrecoverable the moment it changed.
	 * Server-written (see firestore.rules).
	 */
	stanceBaseline: optional(record(string(), number())),
	/** When this person re-rated the island's stances at the end. Server-written. */
	reratedAt: optional(number()),
	valueScores: optional(array(AgoraValueScoreSchema)),
	points: AgoraPointsSchema,
	/**
	 * Set when the one-time first-proposal credit was granted — the
	 * idempotency guard for a trigger that fires on every statement write.
	 */
	firstProposalAwardedAt: optional(number()),
	/** How many of this student's ratings have been credited (cap guard) */
	creditedRatings: optional(number()),
	/**
	 * Durable per-proposal "what I've acknowledged" watermarks (change-awareness
	 * chips survive refresh and device switch). Keyed by proposal statementId.
	 * Written by the student's client only, debounced, monotonic max-merge —
	 * a stale device must never move a watermark backwards.
	 */
	seen: optional(
		record(
			string(),
			object({
				/** Presence of the entry = the proposal is no longer NEW to me */
				firstSeenAt: number(),
				/** The latest agoraScores.lastEditAt I have acknowledged */
				seenEditAt: number(),
			}),
		),
	),
	/** `${proposalId}--${helperUid}` → createdAt of the newest thread message read */
	seenThreads: optional(record(string(), number())),
	joinedAt: number(),
	lastActive: number(),
});

export type AgoraParticipant = InferOutput<typeof AgoraParticipantSchema>;

export function createAgoraParticipantId(sessionId: string, userId: string): string {
	return `${sessionId}--${userId}`;
}

/**
 * Key of a proposal↔helper thread in `seenThreads`. The helper uid is the
 * thread identity on both sides — owner replies use the helper's uid too.
 */
export function createAgoraThreadKey(proposalId: string, helperUid: string): string {
	return `${proposalId}--${helperUid}`;
}
