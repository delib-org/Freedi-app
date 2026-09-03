import { number, object, optional, string, InferOutput } from 'valibot';

/**
 * A student's real name, typed at the door, for the teacher's eyes only.
 *
 * Doc id: `${sessionId}--${uid}` — the same key as the participant doc, but a
 * DIFFERENT collection, because participant docs are readable by every
 * signed-in user (the lobby, the boards and the looks all list them). This
 * one is readable by the session's teacher alone: `teacherId` is denormalised
 * onto every doc so the rule is a plain equality the teacher's listener can
 * prove (`where sessionId == X && teacherId == me`).
 *
 * Never copied anywhere: not onto participants, statements, evaluations,
 * notifications, aggregates or into an LLM prompt. Never logged. Expires by
 * TTL (`expiresAt`) so a child's name does not outlive the lesson it served.
 */
export const AgoraIdentitySchema = object({
	identityId: string(),
	sessionId: string(),
	teacherId: string(),
	userId: string(),
	/** The pseudonym on their cards, copied at join, so the console prints "anon → real" */
	anonName: string(),
	realName: string(),
	/** Class games: the roster spot, for a per-class follow-up */
	memberId: optional(string()),
	createdAt: number(),
	lastUpdate: number(),
	/** Firestore TTL field — the doc is deleted around this time */
	expiresAt: number(),
});

export type AgoraIdentity = InferOutput<typeof AgoraIdentitySchema>;

export function createAgoraIdentityId(sessionId: string, userId: string): string {
	return `${sessionId}--${userId}`;
}
