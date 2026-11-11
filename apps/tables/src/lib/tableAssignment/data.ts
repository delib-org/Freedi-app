import { collection, doc, getDocs, query, where } from 'firebase/firestore';
import type {
	DocumentData,
	FirestoreError,
	Query,
	QuerySnapshot,
	Unsubscribe,
} from 'firebase/firestore';
import { Collections, tableAssignmentParticipantId, StatementType } from '@freedi/shared-types';
import type {
	Statement,
	TableAssignment,
	TableAssignmentCounter,
	TableAssignmentParticipant,
	TableAssignmentRosterEntry,
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
			query(collection(db, Collections.tableAssignments), where('hostUid', '==', hostUid)),
			(snap) =>
				onData(
					snap.docs
						.map((d) => d.data() as TableAssignment)
						.sort((a, b) => b.createdAt - a.createdAt),
				),
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

function rosterQuery(sessionId: string): Query<DocumentData> {
	return query(
		collection(db, Collections.tableAssignmentRoster),
		where('sessionId', '==', sessionId),
	);
}

function rosterEntries(snap: QuerySnapshot<DocumentData>): TableAssignmentRosterEntry[] {
	return snap.docs.map((d) => d.data() as TableAssignmentRosterEntry);
}

/** The host's list of name cards. Choices and positions are not on them. */
export function subscribeRoster(sessionId: string): Subscription<TableAssignmentRosterEntry[]> {
	return (onData, onError) =>
		resilientQuery(
			'tablesRoster',
			rosterQuery(sessionId),
			(snap) => onData(rosterEntries(snap)),
			onError,
		);
}

/**
 * A registered participant's view of the session's name cards, readable once
 * tables are public. The read is refused the moment the person's own
 * registration is gone (cancelled, removed, continued on another phone): that
 * is the end of the list, not a failure.
 */
export function subscribeTablemates(sessionId: string): Subscription<TableAssignmentRosterEntry[]> {
	return (onData, onError) =>
		resilientQuery(
			'tablesTablemates',
			rosterQuery(sessionId),
			(snap) => onData(rosterEntries(snap)),
			(error) => (error.code === 'permission-denied' ? onData([]) : onError(error)),
			{ deniedIsFinal: true },
		);
}

/** How many registered; 0 until the first registration writes the counter. */
export function subscribeCounter(sessionId: string): Subscription<number> {
	return (onData, onError) =>
		resilientDoc(
			'tablesCounter',
			doc(db, Collections.tableAssignmentCounters, sessionId),
			(snap) => onData(snap.exists() ? (snap.data() as TableAssignmentCounter).registered : 0),
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

/** Direct mode: seats taken per table index, from the `tableAssignmentSeats` counter docs of one session. */
export function subscribeSeats(sessionId: string): Subscription<Map<number, number>> {
	return (onData, onError) =>
		resilientQuery(
			'tablesSeats',
			query(collection(db, Collections.tableAssignmentSeats), where('sessionId', '==', sessionId)),
			(snap) => {
				const counts = new Map<number, number>();

				for (const d of snap.docs) {
					const seat = d.data() as { tableIndex: number; count: number };

					counts.set(seat.tableIndex, seat.count);
				}
				onData(counts);
			},
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
 * A question's chosen options (statements whose parent is the
 * question and `isChosen` is true). Rejects with the Firestore error when
 * the read is not permitted; the caller shows it, it does not crash.
 */
export async function fetchChosenOptions(questionId: string): Promise<Statement[]> {
	const snap = await getDocs(
		query(
			collection(db, Collections.statements),
			where('parentId', '==', questionId),
			where('statementType', '==', StatementType.option),
			where('isChosen', '==', true),
		),
	);

	return snap.docs.map((d) => d.data() as Statement);
}
