import type { DocumentSnapshot, Firestore, Transaction } from 'firebase-admin/firestore';
import { tableAssignmentParticipantId } from '@freedi/shared-types';
import type { TableAssignmentCounter, TableAssignmentParticipant } from '@freedi/shared-types';
import { counterRef, participantRef, rosterRef, seatRef } from './tablesAccess';
import type { SeatDoc } from './tablesAccess';

/**
 * How a registration leaves a session: cancel and the host's remove free the
 * seat, a claim passes it on. A transaction must finish its reads before its first write,
 * so loading and deleting are separate steps.
 */
export interface LoadedRegistration {
	participant: TableAssignmentParticipant;
	/** The counter of the direct-mode table this person holds, when they hold one. */
	seat?: DocumentSnapshot;
	registeredCount: number;
}

/** Reads what a removal needs; undefined when the person is not registered. */
export async function loadRegistration(
	tx: Transaction,
	firestore: Firestore,
	sessionId: string,
	uid: string,
): Promise<LoadedRegistration | undefined> {
	const snap = await tx.get(
		participantRef(firestore, tableAssignmentParticipantId(sessionId, uid)),
	);
	if (!snap.exists) return undefined;
	const participant = snap.data() as TableAssignmentParticipant;
	const { chosenTableIndex } = participant;
	const [seat, counter] = await Promise.all([
		chosenTableIndex === undefined
			? Promise.resolve(undefined)
			: tx.get(seatRef(firestore, sessionId, chosenTableIndex)),
		tx.get(counterRef(firestore, sessionId)),
	]);
	const registeredCount = counter.exists
		? (counter.data() as TableAssignmentCounter).registered
		: 0;

	return { participant, seat, registeredCount };
}

/** Deletes the private record and the name card; a seat and the count are left alone. */
export function deleteRegistrationRecords(
	tx: Transaction,
	firestore: Firestore,
	{ sessionId, uid }: Pick<TableAssignmentParticipant, 'sessionId' | 'uid'>,
): void {
	const id = tableAssignmentParticipantId(sessionId, uid);
	tx.delete(participantRef(firestore, id));
	tx.delete(rosterRef(firestore, id));
}

/** Deletes the private record and the name card and frees any seat. The count is left alone. */
function deleteRegistration(
	tx: Transaction,
	firestore: Firestore,
	{ participant, seat }: LoadedRegistration,
): void {
	deleteRegistrationRecords(tx, firestore, participant);
	if (seat?.exists) {
		const held = seat.data() as SeatDoc;
		tx.set(seat.ref, { ...held, count: Math.max(0, held.count - 1) });
	}
}

/**
 * Deletes the registration and takes one off the count. The count was read in
 * this transaction, so it can never go below zero, even on a session whose
 * counter the backfill has not written yet.
 */
export function deleteCountedRegistration(
	tx: Transaction,
	firestore: Firestore,
	registration: LoadedRegistration,
): void {
	deleteRegistration(tx, firestore, registration);
	const { sessionId } = registration.participant;
	const counter: TableAssignmentCounter = {
		sessionId,
		registered: Math.max(0, registration.registeredCount - 1),
	};
	tx.set(counterRef(firestore, sessionId), counter);
}
