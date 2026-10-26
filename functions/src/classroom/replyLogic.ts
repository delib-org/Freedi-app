import { CLASS_REPLY_MAX_LENGTH, StatementType } from '@freedi/shared-types';
import type { ClassReplyRole, LessonStatus, Statement } from '@freedi/shared-types';
import { ClassroomError } from './classroomErrors';

/**
 * Pure logic behind `classPostReply` and the reply push (IA 22): what a reply
 * may say, who it is from, which proposal it may answer, and whether the
 * author's phone is told now.
 */

const MS_PER_MINUTE = 60_000;
/** At most one push per proposal in this window (IA 22.7). */
export const REPLY_PUSH_MIN_GAP_MS = 3 * MS_PER_MINUTE;
/** At most this many pushes to one author per lesson (one proposal per student per lesson). */
export const REPLY_PUSH_MAX_PER_LESSON = 5;
/** A push older than this is stale: FCM drops it instead of delivering it late. */
export const REPLY_PUSH_TTL_SECONDS = 60 * 60;

/** The trimmed text of a reply, or a refusal: empty, or longer than CLASS_REPLY_MAX_LENGTH. */
export function cleanReplyText(value: unknown): string {
	if (typeof value !== 'string') throw new ClassroomError('invalid-argument', 'text is required');
	const text = value.trim();
	if (text.length === 0) throw new ClassroomError('invalid-argument', 'text is required');
	if (text.length > CLASS_REPLY_MAX_LENGTH) {
		throw new ClassroomError('invalid-argument', 'The reply is too long', 'reply-too-long');
	}

	return text;
}

/** Teacher first (they may also be the author of nothing), then the proposal's author, else a classmate. */
export function replyRoleOf(
	actorUid: string,
	isTeacher: boolean,
	proposal: Statement,
): ClassReplyRole {
	if (isTeacher) return 'teacher';

	return proposal.creatorId === actorUid ? 'author' : 'class';
}

/**
 * A reply may answer a visible proposal of THIS lesson: an option under the
 * lesson's challenge question. Anything else is refused.
 */
export function assertReplyTarget(
	proposal: Statement | undefined,
	question: Statement | undefined,
	mainId: string,
): asserts proposal is Statement {
	const ok =
		proposal?.statementType === StatementType.option &&
		proposal.hide !== true &&
		question?.statementType === StatementType.question &&
		question.statementId === proposal.parentId &&
		question.parentId === mainId &&
		question.statementSettings?.classRole === 'challenge';
	if (!ok) {
		throw new ClassroomError('invalid-argument', 'Only a proposal of this lesson can get replies');
	}
}

export interface ReplyPushInput {
	now: number;
	lessonStatus: LessonStatus;
	replierUid: string;
	authorUid: string;
	/** The author has at least one join-class device that said yes. */
	hasDevice: boolean;
	/** The proposal's `replyPushAt`. */
	lastPushAt: number | undefined;
	/** The proposal's `replyPushCount`. */
	pushCount: number | undefined;
}

export type ReplyPushSkip = 'self' | 'lesson-stopped' | 'no-device' | 'too-soon' | 'cap';
export type ReplyPushDecision = { send: true } | { send: false; reason: ReplyPushSkip };

/**
 * Whether this reply buzzes the author's phone (IA 22.7). Never for the
 * author's own reply; never while the lesson is paused or ended; only with a
 * device; at most once per proposal per REPLY_PUSH_MIN_GAP_MS and
 * REPLY_PUSH_MAX_PER_LESSON times per lesson. Skipped replies still show in
 * the app (count + toast), so nothing is lost.
 */
export function decideReplyPush(input: ReplyPushInput): ReplyPushDecision {
	if (input.replierUid === input.authorUid) return { send: false, reason: 'self' };
	if (input.lessonStatus === 'paused' || input.lessonStatus === 'ended') {
		return { send: false, reason: 'lesson-stopped' };
	}
	if (!input.hasDevice) return { send: false, reason: 'no-device' };
	if ((input.pushCount ?? 0) >= REPLY_PUSH_MAX_PER_LESSON) return { send: false, reason: 'cap' };
	if (input.lastPushAt !== undefined && input.now - input.lastPushAt < REPLY_PUSH_MIN_GAP_MS) {
		return { send: false, reason: 'too-soon' };
	}

	return { send: true };
}

/**
 * The proposal's visible reply count after a teacher hides or restores one
 * reply. Only a real change moves it; never below zero.
 */
export function replyCountAfter(
	count: number | undefined,
	wasHidden: boolean,
	hidden: boolean,
): number {
	const current = count ?? 0;
	if (wasHidden === hidden) return current;

	return hidden ? Math.max(0, current - 1) : current + 1;
}

/** Replies the author has not opened yet: by others, not hidden, newer than the read mark. */
export function unreadForAuthor(
	replies: readonly Pick<Statement, 'creatorId' | 'hide' | 'createdAt'>[],
	authorUid: string,
	readAt: number | undefined,
): number {
	return replies.filter(
		(r) => r.creatorId !== authorUid && r.hide !== true && (r.createdAt ?? 0) > (readAt ?? 0),
	).length;
}
