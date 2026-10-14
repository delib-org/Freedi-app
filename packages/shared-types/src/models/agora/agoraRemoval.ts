/**
 * The teacher removes a participant from a live lesson.
 *
 * Removal is two writes in one transaction (`agoraRemoveParticipant`): the
 * participant doc is deleted — so every count, census, lottery and console
 * row loses the student without anyone filtering — and the uid lands in the
 * session's `removedUids`, the block list the join callable and the rules
 * read. Their notes stay on the board (the teacher can still take any of
 * them down through moderation), and nothing outside this session changes.
 */

/** The part of a session the block list lives on */
export interface RemovalSession {
	removedUids?: Record<string, number>;
}

/** Whether the teacher removed this login from this session */
export function isRemovedFromAgoraSession(
	session: RemovalSession | null | undefined,
	uid: string | null | undefined,
): boolean {
	if (!session || !uid) return false;
	const removedAt = session.removedUids?.[uid];

	return typeof removedAt === 'number';
}

/** The refusal code every server path uses for a removed student */
export const AGORA_REMOVED_REASON = 'removed-from-session';
