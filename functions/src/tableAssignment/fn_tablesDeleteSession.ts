import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { functionConfig } from '@freedi/shared-types';
import type {
	TableAssignment,
	TablesDeleteSessionRequest,
	TablesDeleteSessionResponse,
} from '@freedi/shared-types';
import { db } from '../db';
import { deleteSessionData } from './sessionData';
import { actorFrom, assertHost, requireId, sessionRef } from './tablesAccess';
import { toHttpsError } from './tablesErrors';

/**
 * `tablesDeleteSession` (host, any status): deletes the session and everything
 * stored under it. The session first moves to `ended`, which shuts out new
 * registrations and answers while the documents go. Calling it for a session
 * already gone succeeds, so a double click or a retry is harmless.
 */
export async function deleteSession(
	firestore: Firestore,
	uid: string,
	req: TablesDeleteSessionRequest,
	now: number = Date.now(),
): Promise<TablesDeleteSessionResponse> {
	const sessionId = requireId(req?.sessionId, 'sessionId');
	const ref = sessionRef(firestore, sessionId);
	const exists = await firestore.runTransaction(async (tx) => {
		const snap = await tx.get(ref);
		if (!snap.exists) return false;
		const session = snap.data() as TableAssignment;
		assertHost(session, uid);
		if (session.status !== 'ended') tx.update(ref, { status: 'ended', lastUpdate: now });

		return true;
	});
	if (exists) await deleteSessionData(firestore, sessionId);

	return { deleted: true };
}

export const tablesDeleteSession = onCall(
	{ region: functionConfig.region, timeoutSeconds: 120 },
	async (
		request: CallableRequest<TablesDeleteSessionRequest>,
	): Promise<TablesDeleteSessionResponse> => {
		let uid: string | undefined;
		try {
			uid = actorFrom(request).uid;

			return await deleteSession(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'tableAssignment.tablesDeleteSession',
				userId: uid,
				metadata: { sessionId: request.data?.sessionId },
			});
		}
	},
);
