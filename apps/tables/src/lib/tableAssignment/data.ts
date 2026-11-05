import { collection, doc, getDocs, orderBy, query, where } from 'firebase/firestore';
import type { FirestoreError, Unsubscribe } from 'firebase/firestore';
import { Collections, tableAssignmentParticipantId } from '@freedi/shared-types';
import type {
	Statement,
	TableAssignment,
	TableAssignmentParticipant,
	TableAssignmentRun,
	TableAssignmentTopic,
} from '@freedi/shared-types';
import { db } from '@/lib/firebase';
import { resilientDoc, resilientQuery } from '@/lib/listeners';

/**
 * Live reads of Tables data. Writes never happen here: they go through the
 * callables in client.ts. A subscription reports data or an error.
 */

export type Subscription<T> = (
	onData: (data: T) => void,
	onError: (error: FirestoreError) => void,
) => Unsubscribe;

export function subscribeHostSessions(hostUid: string): Subscription<TableAssignment[]> {
	return (onData, onError) =>
		resilientQuery(
			'tablesHostSessions',
			query(
				collection(db, Collections.tableAssignments),
				where('hostUid', '==', hostUid),
				orderBy('createdAt', 'desc'),
			),
			(snap) => onData(snap.docs.map((d) => d.data() as TableAssignment)),
			onError,
		);
}

/** The session document; `null` when it does not exist. */
export function subscribeSession(sessionId: string): Subscription<TableAssignment | null> {
	return (onData, onError) =>
		resilientDoc(
			'tablesSession',
			doc(db, Collections.tableAssignments, sessionId),
			(snap) => onData(snap.exists() ? (snap.data() as TableAssignment) : null),
			onError,
		);
}

export function subscribeTopics(sessionId: string): Subscription<TableAssignmentTopic[]> {
	return (onData, onError) =>
		resilientQuery(
			'tablesTopics',
			query(collection(db, Collections.tableAssignmentTopics), where('sessionId', '==', sessionId)),
			(snap) =>
				onData(
					snap.docs.map((d) => d.data() as TableAssignmentTopic).sort((a, b) => a.order - b.order),
				),
			onError,
		);
}

/** All registrants of a session (host only; the rules decide). */
export function subscribeParticipants(
	sessionId: string,
): Subscription<TableAssignmentParticipant[]> {
	return (onData, onError) =>
		resilientQuery(
			'tablesParticipants',
			query(
				collection(db, Collections.tableAssignmentParticipants),
				where('sessionId', '==', sessionId),
			),
			(snap) => onData(snap.docs.map((d) => d.data() as TableAssignmentParticipant)),
			onError,
		);
}

/** One registrant's own document; `null` while not registered. */
export function subscribeMyParticipant(
	sessionId: string,
	uid: string,
): Subscription<TableAssignmentParticipant | null> {
	return (onData, onError) =>
		resilientDoc(
			'tablesMyParticipant',
			doc(
				db,
				Collections.tableAssignmentParticipants,
				tableAssignmentParticipantId(sessionId, uid),
			),
			(snap) => onData(snap.exists() ? (snap.data() as TableAssignmentParticipant) : null),
			onError,
		);
}

/** One run by id; `null` when it does not exist. */
export function subscribeRun(runId: string): Subscription<TableAssignmentRun | null> {
	return (onData, onError) =>
		resilientDoc(
			'tablesRun',
			doc(db, Collections.tableAssignmentRuns, runId),
			(snap) => onData(snap.exists() ? (snap.data() as TableAssignmentRun) : null),
			onError,
		);
}

/** Every run of a session (host only). The newest is picked client-side, so no composite index is needed. */
export function subscribeRuns(sessionId: string): Subscription<TableAssignmentRun[]> {
	return (onData, onError) =>
		resilientQuery(
			'tablesRuns',
			query(collection(db, Collections.tableAssignmentRuns), where('sessionId', '==', sessionId)),
			(snap) => onData(snap.docs.map((d) => d.data() as TableAssignmentRun)),
			onError,
		);
}

/**
 * The options a question's admin selected (statements whose parent is the
 * question and `isSelected` is true). Rejects with the Firestore error when
 * the read is not permitted; the caller shows it, it does not crash.
 */
export async function fetchSelectedOptions(questionId: string): Promise<Statement[]> {
	const snap = await getDocs(
		query(
			collection(db, Collections.statements),
			where('parentId', '==', questionId),
			where('isSelected', '==', true),
		),
	);

	return snap.docs.map((d) => d.data() as Statement);
}
