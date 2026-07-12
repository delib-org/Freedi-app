import {
	object,
	string,
	number,
	optional,
	array,
	enum_,
	InferOutput,
} from 'valibot';
import { AgoraCamp } from './agoraEnums';

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
	/** Number of students at this device in team mode */
	teamMemberCount: optional(number()),
	/** 0 (fully left camp) … 100 (fully right camp) */
	campPosition: optional(number()),
	camp: optional(enum_(AgoraCamp)),
	valueScores: optional(array(AgoraValueScoreSchema)),
	points: AgoraPointsSchema,
	joinedAt: number(),
	lastActive: number(),
});

export type AgoraParticipant = InferOutput<typeof AgoraParticipantSchema>;

export function createAgoraParticipantId(sessionId: string, userId: string): string {
	return `${sessionId}--${userId}`;
}
