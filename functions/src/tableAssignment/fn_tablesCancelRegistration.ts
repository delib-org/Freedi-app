import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { functionConfig } from '@freedi/shared-types';
import type {
	TablesCancelRegistrationRequest,
	TablesCancelRegistrationResponse,
} from '@freedi/shared-types';
import { db } from '../db';
import { deleteCountedRegistration, loadRegistration } from './removeRegistration';
import { actorFrom, readSession, requireId } from './tablesAccess';
import { TablesError, toHttpsError } from './tablesErrors';

/**
 * `tablesCancelRegistration` (the participant themself): leaves the session
 * while registration is open. Cancel belongs to the browser that registered,
 * so a registration taken over by full name cannot be cancelled: without this
 * refusal, typing someone's name would be enough to remove them. Calling it
 * when not registered succeeds and changes nothing.
 */
export async function cancelRegistration(
	firestore: Firestore,
	uid: string,
	req: TablesCancelRegistrationRequest,
): Promise<TablesCancelRegistrationResponse> {
	const sessionId = requireId(req?.sessionId, 'sessionId');

	return firestore.runTransaction(async (tx) => {
		const session = await readSession(tx, firestore, sessionId);
		if (session.status !== 'registrationOpen') {
			throw new TablesError(
				'failed-precondition',
				'Registration is not open',
				'registration-closed',
			);
		}
		const registration = await loadRegistration(tx, firestore, sessionId, uid);
		if (!registration) return { cancelled: true };
		if (registration.participant.claimedByName) {
			throw new TablesError(
				'failed-precondition',
				'A registration continued by full name cannot be cancelled',
				'claimed-by-name',
			);
		}
		deleteCountedRegistration(tx, firestore, registration);

		return { cancelled: true };
	});
}

export const tablesCancelRegistration = onCall(
	{ region: functionConfig.region },
	async (
		request: CallableRequest<TablesCancelRegistrationRequest>,
	): Promise<TablesCancelRegistrationResponse> => {
		let uid: string | undefined;
		try {
			uid = actorFrom(request).uid;

			return await cancelRegistration(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'tableAssignment.tablesCancelRegistration',
				userId: uid,
				metadata: { sessionId: request.data?.sessionId },
			});
		}
	},
);
