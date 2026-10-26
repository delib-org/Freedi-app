import type { ClassReplyRole, Statement } from '@freedi/shared-types';

/**
 * Pure side of the replies on a proposal (IA 22): which replies a phone shows,
 * how each is tagged, how many are unread for the author, and when the
 * author's toast may speak. No Firestore, no DOM.
 */

/** At most one "new reply" toast per this window (IA 22.7). */
export const REPLY_TOAST_GAP_MS = 60_000;

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

export interface ToastInput {
	now: number;
	/** When the last toast was shown; null = never. */
	lastToastAt: number | null;
	/** Reply ids already announced (or present at the first delivery). */
	seen: ReadonlySet<string>;
	/** Unread replies now. */
	unread: readonly Statement[];
	/** The author is looking at their replies right now. */
	sheetOpen: boolean;
}

/**
 * Whether a new reply makes the author's phone say "New reply to your
 * proposal": something unread that was not announced yet, the replies not
 * already open, and no toast in the last REPLY_TOAST_GAP_MS.
 */
export function shouldToast(input: ToastInput): boolean {
	if (input.sheetOpen) return false;
	const fresh = input.unread.some((r) => !input.seen.has(r.statementId));
	if (!fresh) return false;

	return input.lastToastAt === null || input.now - input.lastToastAt >= REPLY_TOAST_GAP_MS;
}

/** The count line on the own card: "2 new replies" / "1 new reply"; empty when none. */
export function unreadLineKey(n: number): { key: string; params?: Record<string, number> } | null {
	if (n <= 0) return null;

	return n === 1 ? { key: 'reply.new_one' } : { key: 'reply.new_n', params: { n } };
}
