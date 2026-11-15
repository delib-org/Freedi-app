import { randomUUID } from 'crypto';
import type { DocumentReference, Firestore, Query } from 'firebase-admin/firestore';
import { Collections, classRegistrationOf } from '@freedi/shared-types';
import type { ClassRegistration, Statement, TableAssignment } from '@freedi/shared-types';
import { loadMain } from '../classroomAccess';
import { ClassroomError } from '../classroomErrors';
import { assertLessonNotEnded } from '../lessonStatusGuard';

/**
 * The Class side of the Tables-Class bridge (IA tables-class-bridge 5.3-5.4).
 *
 * One ledger doc per registration a lesson knows about,
 * `classRegistrationSeats/{mainId}--{registrationUid}`: which table the
 * registration has, which device (Class uid) holds it, and the opaque `seatId`
 * the screens use. Server-only: no rule matches the collection, so no client
 * reads it, and a Tables uid never reaches a Class screen.
 */
const REGISTRATION_SEATS_COLLECTION = 'classRegistrationSeats';

export interface RegistrationSeatDoc {
	mainId: string;
	sessionId: string;
	/** The registration's owner in Tables. Never sent to a client. */
	registrationUid: string;
	fullName: string;
	/** tableAssignmentNameKey(fullName). */
	nameKey: string;
	/** Opaque id of the seat: in `reservedSeats`, in name choices, in "add without a device". */
	seatId: string;
	/** The table the registration was copied to (1-based). Absent before copying, or with no table. */
	tableN?: number;
	/** The topic's title at that table; absent in a one-topic event. */
	topic?: string;
	/** The device that holds the seat now (the latest one). */
	classUid?: string;
	/** The teacher seated this person as one without a device (classAddNoDevice with seatId). */
	noDeviceId?: string;
	/** First arrival, by link, name or without a device. */
	arrivedAt?: number;
}

export function registrationSeatRef(
	firestore: Firestore,
	mainId: string,
	registrationUid: string,
): DocumentReference {
	return firestore.collection(REGISTRATION_SEATS_COLLECTION).doc(`${mainId}--${registrationUid}`);
}

export function registrationSeatsQuery(firestore: Firestore, mainId: string): Query {
	return firestore.collection(REGISTRATION_SEATS_COLLECTION).where('mainId', '==', mainId);
}

/** The ledger doc of one reserved seat id. Two equalities, so no composite index. */
export function registrationSeatByIdQuery(
	firestore: Firestore,
	mainId: string,
	seatId: string,
): Query {
	return registrationSeatsQuery(firestore, mainId).where('seatId', '==', seatId);
}

export function newSeatId(): string {
	return randomUUID();
}

export function assignmentRef(firestore: Firestore, sessionId: string): DocumentReference {
	return firestore.collection(Collections.tableAssignments).doc(sessionId);
}

export interface ConnectedLesson {
	main: Statement;
	registration: ClassRegistration;
	session: TableAssignment;
}

/**
 * The lesson, its connection and the registration, checked both ways: the
 * lesson names the registration and the registration names the lesson. The
 * lesson must not have ended; the registration must not have ended.
 */
export async function loadConnectedLesson(
	firestore: Firestore,
	mainId: string,
): Promise<ConnectedLesson> {
	const main = await loadMain(firestore, mainId);
	assertLessonNotEnded(main);
	const registration = classRegistrationOf(main);
	if (!registration) {
		throw new ClassroomError(
			'failed-precondition',
			'No registration is connected',
			'not-connected',
		);
	}
	const snap = await assignmentRef(firestore, registration.tableAssignmentId).get();
	const session = snap.data() as TableAssignment | undefined;
	if (!session || session.contextStatementId !== mainId) {
		throw new ClassroomError(
			'failed-precondition',
			'The registration is not connected to this lesson',
			'connected-elsewhere',
		);
	}
	if (session.status === 'ended') {
		throw new ClassroomError(
			'failed-precondition',
			'The registration has ended',
			'registration-ended',
		);
	}

	return { main, registration, session };
}
