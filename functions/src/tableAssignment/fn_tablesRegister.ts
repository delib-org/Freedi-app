import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
	TABLE_ASSIGNMENT_FULL_NAME_MAX_LENGTH,
	functionConfig,
	tableAssignmentParticipantId,
} from '@freedi/shared-types';
import type {
	TableAssignmentParticipant,
	TablesRegisterRequest,
	TablesRegisterResponse,
} from '@freedi/shared-types';
import { db } from '../db';
import { FULL_NAME_MIN_LENGTH } from './constants';
import { actorFrom, participantRef, readSession, requireId } from './tablesAccess';
import { TablesError, toHttpsError } from './tablesErrors';
import { requireText } from './validation';

/**
 * `tablesRegister` (any signed-in caller, anonymous included): upserts the
 * caller's participant doc `${sessionId}_${uid}`. Allowed while registration
 * is open, and after publishing so latecomers can still register (they stay
 * unseated until the host publishes a new run). Registering again only
 * updates the name; preferences, position and table are kept.
 */
export async function register(
	firestore: Firestore,
	uid: string,
	req: TablesRegisterRequest,
	now: number = Date.now(),
): Promise<TablesRegisterResponse> {
	const sessionId = requireId(req?.sessionId, 'sessionId');
	const fullName = requireText(
		req.fullName,
		'fullName',
		FULL_NAME_MIN_LENGTH,
		TABLE_ASSIGNMENT_FULL_NAME_MAX_LENGTH,
	);
	const ref = participantRef(firestore, tableAssignmentParticipantId(sessionId, uid));

	return firestore.runTransaction(async (tx) => {
		const session = await readSession(tx, firestore, sessionId);
		if (session.status !== 'registrationOpen' && session.status !== 'published') {
			throw new TablesError(
				'failed-precondition',
				'Registration is not open',
				'registration-closed',
			);
		}
		const snap = await tx.get(ref);
		const participant: TableAssignmentParticipant = snap.exists
			? { ...(snap.data() as TableAssignmentParticipant), fullName }
			: { sessionId, uid, fullName, preferences: [], registeredAt: now };
		tx.set(ref, participant);

		return { participant };
	});
}

export const tablesRegister = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<TablesRegisterRequest>): Promise<TablesRegisterResponse> => {
		let uid: string | undefined;
		try {
			uid = actorFrom(request).uid;

			return await register(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'tableAssignment.tablesRegister',
				userId: uid,
				metadata: { sessionId: request.data?.sessionId },
			});
		}
	},
);
