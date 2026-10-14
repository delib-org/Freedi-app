/**
 * The teacher removes a participant from a live lesson — and decides,
 * student by student, who comes back.
 *
 * Removal (`agoraRemoveParticipant`) is one transaction: the participant doc
 * is deleted — so every count, census, lottery and console row loses the
 * student without anyone filtering — its full contents are parked in
 * `agoraRemovals/{sessionId}--{uid}` (server-only), and the uid lands in the
 * session's `removedUids` with the pseudonym it played under. That entry is
 * the block list the join callable and the rules read.
 *
 * A removed login that knocks again (the join door) is NOT seated: the join
 * callable stamps `requestedAt` on its entry and the student waits. The
 * teacher approves (`agoraResolveRejoin`): the entry goes and the parked seat
 * comes back — same pseudonym, so their earlier notes are theirs again — or
 * declines: `declinedAt` is stamped and the student may knock again after a
 * short pause. One pending request per uid, by construction: a knock while
 * one is pending changes nothing.
 */
import { number, object, optional, string, InferOutput } from 'valibot';

export const AgoraRemovalSchema = object({
	removedAt: number(),
	/** The pseudonym they played under — given back on return */
	anonName: string(),
	/** They knocked again: waiting for the teacher */
	requestedAt: optional(number()),
	/** The teacher said not now (to the request stamped before this) */
	declinedAt: optional(number()),
});

export type AgoraRemoval = InferOutput<typeof AgoraRemovalSchema>;

export const AGORA_REJOIN = {
	/** After a "not now", how long before the same login may knock again */
	REQUEST_COOLDOWN_MS: 60_000,
} as const;

/** The part of a session the block list lives on */
export interface RemovalSession {
	removedUids?: Record<string, AgoraRemoval>;
}

/** This login's removal record in this session, if the teacher removed it */
export function removalOf(
	session: RemovalSession | null | undefined,
	uid: string | null | undefined,
): AgoraRemoval | undefined {
	if (!session?.removedUids || !uid) return undefined;
	if (!Object.prototype.hasOwnProperty.call(session.removedUids, uid)) return undefined;
	const entry = session.removedUids[uid];

	return entry && typeof entry === 'object' && typeof entry.removedAt === 'number'
		? entry
		: undefined;
}

/** Whether the teacher removed this login from this session (and has not let it back) */
export function isRemovedFromAgoraSession(
	session: RemovalSession | null | undefined,
	uid: string | null | undefined,
): boolean {
	return removalOf(session, uid) !== undefined;
}

/** A knock the teacher has not answered yet */
export function isRejoinPending(removal: AgoraRemoval | undefined): boolean {
	if (!removal || removal.requestedAt === undefined) return false;

	return removal.declinedAt === undefined || removal.requestedAt > removal.declinedAt;
}

/** The teacher's last answer was "not now" (and nothing newer is waiting) */
export function isRejoinDeclined(removal: AgoraRemoval | undefined): boolean {
	return (
		removal !== undefined && removal.declinedAt !== undefined && !isRejoinPending(removal)
	);
}

/** When this login may knock again (0 = now) */
export function rejoinAllowedAt(removal: AgoraRemoval | undefined): number {
	if (!isRejoinDeclined(removal) || removal?.declinedAt === undefined) return 0;

	return removal.declinedAt + AGORA_REJOIN.REQUEST_COOLDOWN_MS;
}

export interface RejoinRequest {
	uid: string;
	anonName: string;
	requestedAt: number;
}

/** Every unanswered knock in this session, oldest first — what the teacher sees */
export function pendingRejoinRequests(session: RemovalSession | null | undefined): RejoinRequest[] {
	const entries = Object.entries(session?.removedUids ?? {});

	return entries
		.filter(([, removal]) => isRejoinPending(removal))
		.map(([uid, removal]) => ({
			uid,
			anonName: removal.anonName,
			requestedAt: removal.requestedAt ?? 0,
		}))
		.sort((a, b) => a.requestedAt - b.requestedAt);
}

/** The refusal code every server path uses for a removed student */
export const AGORA_REMOVED_REASON = 'removed-from-session';
/** A knock inside the pause after a "not now" */
export const AGORA_REJOIN_COOLDOWN_REASON = 'rejoin-cooldown';

/** `agoraRemovals/{sessionId}--{uid}`: the parked seat, server-only */
export function createAgoraRemovalId(sessionId: string, uid: string): string {
	return `${sessionId}--${uid}`;
}
