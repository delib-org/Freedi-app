import type { ClassReplyRole, Statement } from '@freedi/shared-types';

/**
 * Pure side of the replies on a proposal (IA 22): which replies a phone shows,
 * how each is tagged and how many are unread for the author (the lasting
 * notice line, IA 23). No Firestore, no DOM.
 */

/** A reply is a statement carrying the server's `classReply` marker. */
export function isReply(statement: Statement): boolean {
	return statement.classReply !== undefined;
}

/**
 * The replies one viewer sees, oldest first: every visible reply, plus the
 * viewer's own hidden ones (greyed, "the teacher hid this reply"). The teacher
 * sees all, hidden included.
 */
export function visibleReplies(
	replies: readonly Statement[],
	viewerUid: string,
	teacher = false,
): Statement[] {
	return replies
		.filter(isReply)
		.filter((r) => teacher || r.hide !== true || r.creatorId === viewerUid)
		.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

/** How a reply is labelled: never the author's own name (the card stays anonymous, IA 22.8). */
export function replyRole(reply: Statement): ClassReplyRole {
	return reply.classReply?.role ?? 'class';
}

/** Replies the author has not opened: by others, not hidden, newer than the read mark. */
export function unreadReplies(
	replies: readonly Statement[],
	authorUid: string,
	readAt: number | undefined,
): Statement[] {
	return replies.filter(
		(r) =>
			isReply(r) &&
			r.creatorId !== authorUid &&
			r.hide !== true &&
			(r.createdAt ?? 0) > (readAt ?? 0),
	);
}

/** The first unread reply's id (the author's sheet scrolls to it), or null. */
export function firstUnreadId(
	replies: readonly Statement[],
	authorUid: string,
	readAt: number | undefined,
): string | null {
	const unread = unreadReplies(visibleReplies(replies, authorUid), authorUid, readAt);

	return unread[0]?.statementId ?? null;
}

export interface ReplyNotice {
	/** Unread replies on the viewer's own proposals (hidden ones and hidden proposals excluded). */
	count: number;
	/** The proposal the notice opens: the one with the oldest unread reply. */
	proposalId: string | null;
}

/**
 * The lasting "someone replied to you" line (IA 23.1): unread replies by
 * others, not hidden, newer than the read mark, and not under a proposal the
 * teacher hid (a hidden proposal takes its replies out of reach, IA 24.2).
 */
export function replyNotice(
	replies: readonly Statement[],
	authorUid: string,
	readAt: number | undefined,
	hiddenProposalIds: ReadonlySet<string> = new Set(),
): ReplyNotice {
	const unread = unreadReplies(replies, authorUid, readAt)
		.filter((r) => !hiddenProposalIds.has(r.parentId))
		.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

	return { count: unread.length, proposalId: unread[0]?.parentId ?? null };
}

/** Ids of the replies that carry the "new" tag when the author opens their sheet. */
export function newReplyIds(
	replies: readonly Statement[],
	authorUid: string,
	readAt: number | undefined,
): ReadonlySet<string> {
	return new Set(unreadReplies(replies, authorUid, readAt).map((r) => r.statementId));
}

/** The notice line's text key: "1 new reply" or "n new replies"; null when nothing is unread. */
export function noticeKey(n: number): { key: string; params?: Record<string, number> } | null {
	if (n <= 0) return null;

	return n === 1 ? { key: 'reply.notice_one' } : { key: 'reply.notice_n', params: { n } };
}

/** The count line on the own card: "2 new replies" / "1 new reply"; empty when none. */
export function unreadLineKey(n: number): { key: string; params?: Record<string, number> } | null {
	if (n <= 0) return null;

	return n === 1 ? { key: 'reply.new_one' } : { key: 'reply.new_n', params: { n } };
}

/**
 * Which reply threads open by themselves in the teacher's "what they wrote"
 * (IA 24.1): those with more replies than the teacher has seen this session.
 */
export function threadsToOpen(
	byProposal: ReadonlyMap<string, readonly Statement[]>,
	known: ReadonlyMap<string, number>,
): string[] {
	const opening: string[] = [];
	for (const [proposalId, list] of byProposal) {
		if (list.length > (known.get(proposalId) ?? 0)) opening.push(proposalId);
	}

	return opening;
}
