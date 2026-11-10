import { randomUUID } from 'crypto';
import type {
	CollectionReference,
	DocumentReference,
	Firestore,
	Query,
	Transaction,
} from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { Collections } from '@freedi/shared-types';
import type { TableAssignment, TableAssignmentTopic } from '@freedi/shared-types';
import { MAX_ID_LENGTH } from './constants';
import { TablesError } from './tablesErrors';

/**
 * Shared guards and reads of the Tables callables. Hosts sign in with Google;
 * participants may be Firebase anonymous users. Host authority always comes
 * from the session doc's hostUid, never from anything the client sends.
 */

/** Direct mode: one counter per table, doc id `${sessionId}_${tableIndex}`. */
export interface SeatDoc {
	sessionId: string;
	tableIndex: number;
	topicId: string;
	/** Seats taken. Only ever changed inside a transaction that also read it. */
	count: number;
}

/** A run's input hash. No client may read it: over a few answers it can be guessed. */
export interface RunInputDoc {
	sessionId: string;
	inputHash: string;
}

/** How many previews were computed over one set of answers. No client may read it. */
export interface PreviewBudgetDoc {
	sessionId: string;
	computed: number;
}

export interface Actor {
	uid: string;
	isAnonymous: boolean;
}

export function actorFrom<T>(request: CallableRequest<T>): Actor {
	const uid = request.auth?.uid;
	if (!uid) throw new TablesError('unauthenticated', 'Sign in first');

	return { uid, isAnonymous: request.auth?.token?.firebase?.sign_in_provider === 'anonymous' };
}

/** A fresh document id (chosen here so every doc is addressed by an explicit id). */
export function newId(): string {
	return randomUUID();
}

/** A Firestore document id: non-empty string, no slash, bounded length. */
export function requireId(value: unknown, name: string): string {
	if (
		typeof value !== 'string' ||
		value.length === 0 ||
		value.length > MAX_ID_LENGTH ||
		value.includes('/')
	) {
		throw new TablesError('invalid-argument', `${name} is required`);
	}

	return value;
}

export function sessionsCollection(firestore: Firestore): CollectionReference {
	return firestore.collection(Collections.tableAssignments);
}

export function topicsCollection(firestore: Firestore): CollectionReference {
	return firestore.collection(Collections.tableAssignmentTopics);
}

export function runsCollection(firestore: Firestore): CollectionReference {
	return firestore.collection(Collections.tableAssignmentRuns);
}

export function sessionRef(firestore: Firestore, sessionId: string): DocumentReference {
	return sessionsCollection(firestore).doc(sessionId);
}

export function participantRef(firestore: Firestore, participantId: string): DocumentReference {
	return firestore.collection(Collections.tableAssignmentParticipants).doc(participantId);
}

export function rosterRef(firestore: Firestore, participantId: string): DocumentReference {
	return firestore.collection(Collections.tableAssignmentRoster).doc(participantId);
}

export function counterRef(firestore: Firestore, sessionId: string): DocumentReference {
	return firestore.collection(Collections.tableAssignmentCounters).doc(sessionId);
}

export function runRef(firestore: Firestore, runId: string): DocumentReference {
	return runsCollection(firestore).doc(runId);
}

/** Not in the rules on purpose: Firestore denies every client an unmatched collection. */
const RUN_INPUTS_COLLECTION = 'tableAssignmentRunInputs';

export function runInputRef(firestore: Firestore, runId: string): DocumentReference {
	return firestore.collection(RUN_INPUTS_COLLECTION).doc(runId);
}

/** Not in the rules on purpose, like the run inputs: only the functions touch it. */
const PREVIEW_BUDGETS_COLLECTION = 'tableAssignmentPreviewBudgets';

/** One document per session and set of answers, so answers changing back do not refill the budget. */
export function previewBudgetRef(
	firestore: Firestore,
	sessionId: string,
	answersHash: string,
): DocumentReference {
	return firestore.collection(PREVIEW_BUDGETS_COLLECTION).doc(`${sessionId}_${answersHash}`);
}

export function seatRef(
	firestore: Firestore,
	sessionId: string,
	tableIndex: number,
): DocumentReference {
	return firestore.collection(Collections.tableAssignmentSeats).doc(`${sessionId}_${tableIndex}`);
}

export function topicsQuery(firestore: Firestore, sessionId: string): Query {
	return topicsCollection(firestore).where('sessionId', '==', sessionId);
}

export function participantsQuery(firestore: Firestore, sessionId: string): Query {
	return firestore
		.collection(Collections.tableAssignmentParticipants)
		.where('sessionId', '==', sessionId);
}

/** Name cards of one session with this name key. Two equalities, so no composite index. */
export function rosterByNameQuery(firestore: Firestore, sessionId: string, nameKey: string): Query {
	return firestore
		.collection(Collections.tableAssignmentRoster)
		.where('sessionId', '==', sessionId)
		.where('nameKey', '==', nameKey);
}

export function readyRunsQuery(firestore: Firestore, sessionId: string): Query {
	return runsCollection(firestore)
		.where('sessionId', '==', sessionId)
		.where('status', '==', 'ready');
}

/** Topics in display order. */
export function sortTopics(topics: TableAssignmentTopic[]): TableAssignmentTopic[] {
	return [...topics].sort((a, b) => a.order - b.order || a.topicId.localeCompare(b.topicId));
}

/** Session inside a transaction; not-found when missing. */
export async function readSession(
	tx: Transaction,
	firestore: Firestore,
	sessionId: string,
): Promise<TableAssignment> {
	const snap = await tx.get(sessionRef(firestore, sessionId));
	if (!snap.exists) throw new TablesError('not-found', 'Session not found');

	return snap.data() as TableAssignment;
}

export function assertHost(session: TableAssignment, uid: string): void {
	if (session.hostUid !== uid) {
		throw new TablesError('permission-denied', 'Only the host can do this');
	}
}
