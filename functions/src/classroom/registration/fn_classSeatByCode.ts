import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { Collections, functionConfig, tableAssignmentParticipantId } from '@freedi/shared-types';
import type {
	ClassSeatByCodeRequest,
	ClassSeatByCodeResponse,
	TableAssignmentParticipant,
} from '@freedi/shared-types';
import { db } from '../../db';
import { isWellFormedSeatCode, seatCodeRef } from '../../tableAssignment/seatCodes';
import type { SeatCodeDoc } from '../../tableAssignment/seatCodes';
import { requireUid } from '../classroomAccess';
import { ClassroomError, toHttpsError } from '../classroomErrors';
import { arriveOnRegistration } from './arrival';
import { loadConnectedLesson } from './registrationAccess';
import type { ConnectedLesson } from './registrationAccess';

/** Every dead link gets the same answer, so a probe learns nothing about why. */
function inactive(): ClassroomError {
	return new ClassroomError('not-found', 'This link is no longer active', 'seat-link-inactive');
}

interface ResolvedCode {
	connected: ConnectedLesson;
	participant: TableAssignmentParticipant;
}

/**
 * The registration behind a personal link, or a refusal. Alive while the code
 * maps to a registration that still carries it, its session names a lesson that
 * names it back, and neither has ended (IA tables-class-bridge 5.1).
 */
export async function resolveSeatCode(
	firestore: Firestore,
	seatCode: unknown,
): Promise<ResolvedCode> {
	if (!isWellFormedSeatCode(seatCode)) throw inactive();
	const target = (await seatCodeRef(firestore, seatCode).get()).data() as SeatCodeDoc | undefined;
	if (!target) throw inactive();
	// The participant and the session both hang off the code's target: read them together.
	const [participantSnap, sessionSnap] = await Promise.all([
		firestore
			.collection(Collections.tableAssignmentParticipants)
			.doc(tableAssignmentParticipantId(target.sessionId, target.uid))
			.get(),
		firestore.collection(Collections.tableAssignments).doc(target.sessionId).get(),
	]);
	const participant = participantSnap.data() as TableAssignmentParticipant | undefined;
	if (!participant || participant.seatCode !== seatCode) throw inactive();
	const session = sessionSnap.data() as { contextStatementId?: string } | undefined;
	if (!session?.contextStatementId) throw inactive();
	try {
		const connected = await loadConnectedLesson(firestore, session.contextStatementId);
		if (connected.session.tableAssignmentId !== target.sessionId) throw inactive();

		return { connected, participant };
	} catch (error) {
		if (error instanceof ClassroomError) throw inactive();
		throw error;
	}
}

/**
 * `classSeatByCode` (any signed-in caller): the personal link `/seat/:seatCode`
 * exchanged for the seat. The caller joins under the registration's name; the
 * answers (position, choices) never leave the server.
 */
export async function seatByCode(
	firestore: Firestore,
	callerUid: string,
	req: ClassSeatByCodeRequest,
	now: number = Date.now(),
): Promise<ClassSeatByCodeResponse> {
	const { connected, participant } = await resolveSeatCode(firestore, req?.seatCode);

	return arriveOnRegistration(firestore, {
		connected,
		registrationUid: participant.uid,
		fullName: participant.fullName,
		callerUid,
		now,
	});
}

export const classSeatByCode = onCall(
	{ region: functionConfig.region, memory: '512MiB' },
	async (request: CallableRequest<ClassSeatByCodeRequest>): Promise<ClassSeatByCodeResponse> => {
		let uid: string | undefined;
		try {
			uid = requireUid(request);

			return await seatByCode(db, uid, request.data);
		} catch (error) {
			// Never the code itself in a log: it is a key to someone's seat.
			throw toHttpsError(error, { operation: 'classroom.classSeatByCode', userId: uid });
		}
	},
);
