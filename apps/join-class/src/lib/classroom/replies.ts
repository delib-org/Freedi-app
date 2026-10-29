import {
	Collections,
	StatementType,
	getRandomUID,
	getStatementSubscriptionId,
	type ClassPostReplyResponse,
	type Statement,
} from '@freedi/shared-types';
import { collection, db, doc, getDoc, query, updateDoc, where } from '../firebase';
import type { Unsubscribe } from '../firebase';
import { resilientOnSnapshot } from '../resilientListeners';
import { getUserState } from '../user';
import { classPostReply } from './api';

/**
 * Firestore access of the replies on a proposal (IA 22). Replies are written
 * by the `classPostReply` callable only (language check + push); the phone
 * reads them and writes its own read mark. Each listener reads one small set:
 * the replies of one open proposal, the replies addressed to me (the author's
 * one listener), or the lesson's replies (the teacher's console).
 */

const LISTENER = {
	proposal: 'classRepliesOfProposal',
	mine: 'classRepliesToMe',
	lesson: 'classRepliesOfLesson',
	ownProposal: 'classOwnProposal',
} as const;

function replies(snapDocs: readonly { data: () => unknown }[]): Statement[] {
	return snapDocs
		.map((d) => d.data() as Statement)
		.filter((s) => s.statementType === StatementType.statement && s.classReply !== undefined);
}

/** The replies under one proposal (the open sheet). */
export function listenProposalReplies(
	proposalId: string,
	onData: (list: Statement[]) => void,
	onError?: (error: Error) => void,
): Unsubscribe {
	return resilientOnSnapshot(
		LISTENER.proposal,
		query(collection(db, Collections.statements), where('parentId', '==', proposalId)),
		(snap) => onData(replies(snap.docs)),
		(err) => onError?.(err),
	);
}

/** Every reply to a proposal I wrote in this lesson (one listener per author phone). */
export function listenRepliesToMe(
	lessonId: string,
	uid: string,
	onData: (list: Statement[]) => void,
	onError?: (error: Error) => void,
): Unsubscribe {
	return resilientOnSnapshot(
		LISTENER.mine,
		query(
			collection(db, Collections.statements),
			where('parents', 'array-contains', lessonId),
			where('classReply.proposalCreatorId', '==', uid),
		),
		(snap) => onData(replies(snap.docs)),
		(err) => onError?.(err),
	);
}

/** Every reply in the lesson, hidden ones included (the teacher's "what they wrote"). */
export function listenLessonReplies(
	lessonId: string,
	onData: (list: Statement[]) => void,
	onError?: (error: Error) => void,
): Unsubscribe {
	return resilientOnSnapshot(
		LISTENER.lesson,
		query(
			collection(db, Collections.statements),
			where('parents', 'array-contains', lessonId),
			where('statementType', '==', StatementType.statement),
		),
		(snap) => onData(replies(snap.docs)),
		(err) => onError?.(err),
	);
}

/**
 * One proposal of mine, live: the host watches whether the teacher hid it (its
 * replies then leave the unread count, IA 24.2). `null` when the doc is gone.
 */
export function listenProposalDoc(
	proposalId: string,
	onData: (proposal: Statement | null) => void,
	onError?: (error: Error) => void,
): Unsubscribe {
	return resilientOnSnapshot(
		`${LISTENER.ownProposal}:${proposalId}`,
		doc(db, Collections.statements, proposalId),
		(snap) => onData(snap.exists() ? (snap.data() as Statement) : null),
		(err) => onError?.(err),
	);
}

/** One proposal by id (a push tap or the notice line opens its replies); null when gone. */
export async function loadProposal(proposalId: string): Promise<Statement | null> {
	try {
		const snap = await getDoc(doc(db, Collections.statements, proposalId));

		return snap.exists() ? (snap.data() as Statement) : null;
	} catch (error) {
		console.error(
			'[Replies] load failed',
			{ operation: 'replies.loadProposal', proposalId },
			error,
		);

		return null;
	}
}

/** A fresh id for one send; reused on retry so the reply is never posted twice. */
export function newReplyId(): string {
	return getRandomUID();
}

/** Post a reply through the callable (language check first). */
export async function postReply(
	mainId: string,
	proposalId: string,
	replyId: string,
	text: string,
): Promise<ClassPostReplyResponse> {
	try {
		return await classPostReply({ mainId, proposalId, replyId, text });
	} catch (error) {
		console.error(
			'[Replies] post failed',
			{ operation: 'replies.postReply', mainId, proposalId },
			error,
		);
		throw error;
	}
}

/** The author opened their replies: the unread count goes back to 0 on every device. */
export async function markRepliesRead(mainId: string, at: number = Date.now()): Promise<void> {
	const uid = getUserState().user?.uid;
	if (!uid) return;
	const subId =
		getStatementSubscriptionId(mainId, { uid } as Parameters<
			typeof getStatementSubscriptionId
		>[1]) ?? `${uid}--${mainId}`;
	try {
		await updateDoc(doc(db, Collections.statementsSubscribe, subId), {
			proposalRepliesReadAt: at,
			lastUpdate: at,
		});
	} catch (error) {
		console.error(
			'[Replies] read mark failed',
			{ operation: 'replies.markRepliesRead', mainId, uid },
			error,
		);
	}
}
