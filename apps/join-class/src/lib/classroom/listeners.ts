import {
	CLASS_TABLES_COLLECTION,
	ClassTable,
	Collections,
	StatementSubscription,
	getStatementSubscriptionId,
} from '@freedi/shared-types';
import { db, doc, collection, query, where } from '../firebase';
import type { Unsubscribe } from '../firebase';
import { CLASS_LISTENER_KINDS, resilientOnSnapshot } from '../resilientListeners';
import { getUserState } from '../user';

/**
 * Classroom listeners, all through `resilientOnSnapshot` (wake resync + backoff).
 * Each returns the unsubscribe. Prefer `watchClass` in classState.ts, which wires
 * these into the shared store; use these directly only for something bespoke.
 *
 * Rules (current firestore.rules): `statementsSubscribe` is readable by any
 * signed-in user, so `listenRoster` works for the teacher (and, uselessly but
 * harmlessly, for students). `classTables` has NO rule yet — lane C1 adds
 * `allow read: if request.auth != null` (or member/admin scoped).
 */

/** One table doc. `null` when it does not exist (yet). */
export function listenTable(
	tableId: string,
	onData: (table: ClassTable | null) => void,
	onError?: (error: Error) => void,
): Unsubscribe {
	return resilientOnSnapshot(
		CLASS_LISTENER_KINDS.table,
		doc(db, CLASS_TABLES_COLLECTION, tableId),
		(snap) => onData(snap.exists() ? (snap.data() as ClassTable) : null),
		(err) => onError?.(err),
	);
}

/** Every table of a workspace, sorted by table number (teacher). */
export function listenTables(
	mainId: string,
	onData: (tables: ClassTable[]) => void,
	onError?: (error: Error) => void,
): Unsubscribe {
	return resilientOnSnapshot(
		CLASS_LISTENER_KINDS.tables,
		query(collection(db, CLASS_TABLES_COLLECTION), where('mainId', '==', mainId)),
		(snap) => {
			const tables = snap.docs.map((d) => d.data() as ClassTable);
			tables.sort((a, b) => a.n - b.n);
			onData(tables);
		},
		(err) => onError?.(err),
	);
}

/** The signed-in user's own workspace subscription (side, camp, decisionSupport, tableId). */
export function listenMySubscription(
	mainId: string,
	onData: (sub: StatementSubscription | null) => void,
	onError?: (error: Error) => void,
): Unsubscribe {
	const uid = getUserState().user?.uid;
	if (!uid) {
		console.error('[Classroom] listenMySubscription: no signed-in user');

		return () => undefined;
	}
	const subId = getStatementSubscriptionId(mainId, { uid } as Parameters<
		typeof getStatementSubscriptionId
	>[1]);

	return resilientOnSnapshot(
		CLASS_LISTENER_KINDS.mySubscription,
		doc(db, Collections.statementsSubscribe, subId ?? `${uid}--${mainId}`),
		(snap) => onData(snap.exists() ? (snap.data() as StatementSubscription) : null),
		(err) => onError?.(err),
	);
}

/**
 * Every subscription of the workspace (the roster: joined students with their
 * side / camp / decisionSupport / tableId). Teacher / projector use.
 */
export function listenRoster(
	mainId: string,
	onData: (subs: StatementSubscription[]) => void,
	onError?: (error: Error) => void,
): Unsubscribe {
	return resilientOnSnapshot(
		CLASS_LISTENER_KINDS.roster,
		query(collection(db, Collections.statementsSubscribe), where('statementId', '==', mainId)),
		(snap) => onData(snap.docs.map((d) => d.data() as StatementSubscription)),
		(err) => onError?.(err),
	);
}
