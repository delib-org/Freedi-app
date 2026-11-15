import { createHash, randomBytes } from 'crypto';
import type { DocumentReference, Firestore, Query, Transaction } from 'firebase-admin/firestore';
import type { TableAssignmentParticipant } from '@freedi/shared-types';
import { SEAT_CODE_BYTES } from './constants';

/**
 * The personal link (IA tables-class-bridge 5.1): one long random code per
 * registration, `class.wizcol.com/seat/:seatCode`. The code itself lives on the
 * owner-only registration record. This server-only collection maps the code's
 * SHA-256 to the registration, so a copy of this collection cannot be turned
 * back into working links. No rule matches it, so every client is denied.
 */
const SEAT_CODES_COLLECTION = 'tableAssignmentSeatCodes';

/** Where one code leads. Never sent to a client. */
export interface SeatCodeDoc {
	sessionId: string;
	/** The registration's owner (Tables uid). Moves with a claim by full name. */
	uid: string;
	createdAt: number;
}

/** A fresh code: 256 random bits, URL-safe. */
export function newSeatCode(): string {
	return randomBytes(SEAT_CODE_BYTES).toString('base64url');
}

export function seatCodeHash(seatCode: string): string {
	return createHash('sha256').update(seatCode).digest('hex');
}

export function seatCodeRef(firestore: Firestore, seatCode: string): DocumentReference {
	return firestore.collection(SEAT_CODES_COLLECTION).doc(seatCodeHash(seatCode));
}

export function seatCodesQuery(firestore: Firestore, sessionId: string): Query {
	return firestore.collection(SEAT_CODES_COLLECTION).where('sessionId', '==', sessionId);
}

/** A code looks like one we made: anything else is refused before any read. */
export function isWellFormedSeatCode(value: unknown): value is string {
	return typeof value === 'string' && /^[A-Za-z0-9_-]{40,64}$/.test(value);
}

/** The registration is gone: its link stops working. */
export function forgetSeatCode(
	tx: Transaction,
	firestore: Firestore,
	participant: Pick<TableAssignmentParticipant, 'seatCode'>,
): void {
	if (participant.seatCode) tx.delete(seatCodeRef(firestore, participant.seatCode));
}

/** A claim by full name moved the registration to `uid`: the link moves with it. */
export function repointSeatCode(
	tx: Transaction,
	firestore: Firestore,
	participant: Pick<TableAssignmentParticipant, 'seatCode' | 'sessionId'>,
	uid: string,
	now: number,
): void {
	if (!participant.seatCode) return;
	const doc: SeatCodeDoc = { sessionId: participant.sessionId, uid, createdAt: now };
	tx.set(seatCodeRef(firestore, participant.seatCode), doc);
}
