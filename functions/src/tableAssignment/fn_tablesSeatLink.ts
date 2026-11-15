import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { functionConfig, tableAssignmentParticipantId } from '@freedi/shared-types';
import type {
	TableAssignmentParticipant,
	TablesSeatLinkRequest,
	TablesSeatLinkResponse,
} from '@freedi/shared-types';
import { db } from '../db';
import { newSeatCode, seatCodeRef } from './seatCodes';
import type { SeatCodeDoc } from './seatCodes';
import { actorFrom, participantRef, readSession, requireId } from './tablesAccess';
import { TablesError, toHttpsError } from './tablesErrors';

/**
 * `tablesSeatLink` (the participant themself): the code of their personal link
 * into the lesson this session is connected to (IA tables-class-bridge 5.1).
 * The first call makes it; every later call answers the same code, so the link
 * is reusable. The code goes on the caller's own registration (which only they
 * can read) and its hash into a server-only map. Nothing else about the
 * registration leaves the server here.
 */
export async function seatLink(
	firestore: Firestore,
	uid: string,
	req: TablesSeatLinkRequest,
	now: number = Date.now(),
	makeCode: () => string = newSeatCode,
): Promise<TablesSeatLinkResponse> {
	const sessionId = requireId(req?.sessionId, 'sessionId');
	const pRef = participantRef(firestore, tableAssignmentParticipantId(sessionId, uid));

	return firestore.runTransaction(async (tx) => {
		const session = await readSession(tx, firestore, sessionId);
		if (session.status === 'ended') {
			throw new TablesError('failed-precondition', 'The session has ended');
		}
		if (!session.contextStatementId) {
			throw new TablesError('failed-precondition', 'No lesson uses this session', 'not-connected');
		}
		const snap = await tx.get(pRef);
		if (!snap.exists) {
			throw new TablesError('failed-precondition', 'Register first', 'not-registered');
		}
		const participant = snap.data() as TableAssignmentParticipant;
		const seatCode = participant.seatCode ?? makeCode();
		const mapRef = seatCodeRef(firestore, seatCode);
		const mapped = await tx.get(mapRef);

		// ---- writes (all reads are done) ----
		if (!participant.seatCode) tx.update(pRef, { seatCode });
		const target = mapped.data() as SeatCodeDoc | undefined;
		if (!target || target.uid !== uid || target.sessionId !== sessionId) {
			const doc: SeatCodeDoc = { sessionId, uid, createdAt: target?.createdAt ?? now };
			tx.set(mapRef, doc);
		}

		return { seatCode };
	});
}

export const tablesSeatLink = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<TablesSeatLinkRequest>): Promise<TablesSeatLinkResponse> => {
		let uid: string | undefined;
		try {
			uid = actorFrom(request).uid;

			return await seatLink(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'tableAssignment.tablesSeatLink',
				userId: uid,
				metadata: { sessionId: request.data?.sessionId },
			});
		}
	},
);
