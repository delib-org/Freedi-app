import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { functionConfig } from '@freedi/shared-types';
import type {
	TableAssignment,
	TableAssignmentRun,
	TablesRemoveParticipantRequest,
	TablesRemoveParticipantResponse,
} from '@freedi/shared-types';
import { db } from '../db';
import { deleteCountedRegistration, loadRegistration } from './removeRegistration';
import { actorFrom, assertHost, readSession, requireId, runRef } from './tablesAccess';
import { TablesError, toHttpsError } from './tablesErrors';

/**
 * A published assignment is what people were told; quietly taking someone out
 * of it would leave a name on the wall with nobody behind it. A latecomer who
 * registered after publishing has no seat, so removing them changes nothing.
 */
async function assertNotSeatedInPublishedRun(
	tx: Transaction,
	firestore: Firestore,
	session: TableAssignment,
	uid: string,
): Promise<void> {
	if (!session.publishedRunId) return;
	const runSnap = await tx.get(runRef(firestore, session.publishedRunId));
	const run = runSnap.data() as TableAssignmentRun | undefined;
	const mayBeSeated = !run || run.tables.some((table) => table.memberUids.includes(uid));
	if (mayBeSeated) {
		throw new TablesError(
			'failed-precondition',
			'This person is seated in the published assignment',
			'seated-in-published-run',
		);
	}
}

/**
 * `tablesRemoveParticipant` (host, any status but `ended`): deletes a
 * registration the same way cancel does. A ready preview needs no separate
 * handling: its inputHash covers every registrant, so tablesPublishRun refuses
 * it as stale just as it does after a new registration. Removing someone who
 * is not registered succeeds and changes nothing.
 */
export async function removeParticipant(
	firestore: Firestore,
	hostUid: string,
	req: TablesRemoveParticipantRequest,
): Promise<TablesRemoveParticipantResponse> {
	const sessionId = requireId(req?.sessionId, 'sessionId');
	const uid = requireId(req.uid, 'uid');

	return firestore.runTransaction(async (tx) => {
		const session = await readSession(tx, firestore, sessionId);
		assertHost(session, hostUid);
		if (session.status === 'ended') {
			throw new TablesError('failed-precondition', 'The session has ended');
		}
		await assertNotSeatedInPublishedRun(tx, firestore, session, uid);
		const registration = await loadRegistration(tx, firestore, sessionId, uid);
		if (registration) deleteCountedRegistration(tx, firestore, registration);

		return { removed: true };
	});
}

export const tablesRemoveParticipant = onCall(
	{ region: functionConfig.region },
	async (
		request: CallableRequest<TablesRemoveParticipantRequest>,
	): Promise<TablesRemoveParticipantResponse> => {
		let uid: string | undefined;
		try {
			uid = actorFrom(request).uid;

			return await removeParticipant(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'tableAssignment.tablesRemoveParticipant',
				userId: uid,
				metadata: { sessionId: request.data?.sessionId, targetUid: request.data?.uid },
			});
		}
	},
);
