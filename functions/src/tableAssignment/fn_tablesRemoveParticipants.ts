import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { functionConfig, TABLE_ASSIGNMENT_REMOVE_BATCH_MAX } from '@freedi/shared-types';
import type {
	TablesRemoveParticipantsFailure,
	TablesRemoveParticipantsRequest,
	TablesRemoveParticipantsResponse,
} from '@freedi/shared-types';
import { db } from '../db';
import { logError } from '../utils/errorHandling';
import { deleteCountedRegistration, loadRegistration } from './removeRegistration';
import { readPublishedRun, runSeats, unseatFromRun } from './publishedSeating';
import { actorFrom, assertHost, readSession, requireId } from './tablesAccess';
import { TablesError, toHttpsError } from './tablesErrors';

/** One transaction per person, so the call gets more time than a single remove. */
const BATCH_TIMEOUT_SECONDS = 300;

/** Why a person could not be removed; the client shows it as is. */
const NOT_REGISTERED_REASON = 'not-registered';
const INTERNAL_REASON = 'internal';

function checkedUids(req: TablesRemoveParticipantsRequest | undefined): string[] {
	const uids: unknown = req?.uids;
	if (!Array.isArray(uids) || uids.length === 0) {
		throw new TablesError('invalid-argument', 'uids is required');
	}
	if (uids.length > TABLE_ASSIGNMENT_REMOVE_BATCH_MAX) {
		throw new TablesError(
			'invalid-argument',
			`At most ${TABLE_ASSIGNMENT_REMOVE_BATCH_MAX} people can be removed at once`,
		);
	}

	return [...new Set(uids.map((uid) => requireId(uid, 'uid')))];
}

/**
 * Removes one person in their own transaction: the same helper as the single
 * remove (records, seat code, topic count, direct seat, registered counter),
 * and, unlike it, takes them off the published run too. Returns false when
 * there was nothing to remove.
 */
async function removeOne(
	firestore: Firestore,
	hostUid: string,
	sessionId: string,
	uid: string,
): Promise<boolean> {
	return firestore.runTransaction(async (tx) => {
		const session = await readSession(tx, firestore, sessionId);
		assertHost(session, hostUid);
		if (session.status === 'ended') {
			throw new TablesError('failed-precondition', 'The session has ended');
		}
		const registration = await loadRegistration(tx, firestore, sessionId, uid);
		const run = await readPublishedRun(tx, firestore, session);
		const seated = Boolean(run && runSeats(run, uid));
		if (!registration && !seated) return false;
		if (registration) deleteCountedRegistration(tx, firestore, registration, session);
		if (run && seated) unseatFromRun(tx, firestore, run, uid);

		return true;
	});
}

function failureOf(
	error: unknown,
	hostUid: string,
	sessionId: string,
	uid: string,
): TablesRemoveParticipantsFailure {
	if (error instanceof TablesError) return { uid, reason: error.reason ?? error.code };
	logError(error, {
		operation: 'tableAssignment.tablesRemoveParticipants',
		userId: hostUid,
		metadata: { sessionId, targetUid: uid },
	});

	return { uid, reason: INTERNAL_REASON };
}

/**
 * `tablesRemoveParticipants` (host, any status but `ended`): the batch form of
 * the single remove. Who may call and the ended-session refusal are the same;
 * a person seated at the published tables is removed too and their seat freed.
 * One person's failure never undoes the others: the answer lists both.
 */
export async function removeParticipants(
	firestore: Firestore,
	hostUid: string,
	req: TablesRemoveParticipantsRequest,
): Promise<TablesRemoveParticipantsResponse> {
	const sessionId = requireId(req?.sessionId, 'sessionId');
	const uids = checkedUids(req);

	// Refuse a stranger or an ended session once, before touching anyone.
	await firestore.runTransaction(async (tx) => {
		const session = await readSession(tx, firestore, sessionId);
		assertHost(session, hostUid);
		if (session.status === 'ended') {
			throw new TablesError('failed-precondition', 'The session has ended');
		}
	});

	const removed: string[] = [];
	const failed: TablesRemoveParticipantsFailure[] = [];
	// One after another: every removal writes the same counter document.
	for (const uid of uids) {
		try {
			if (await removeOne(firestore, hostUid, sessionId, uid)) removed.push(uid);
			else failed.push({ uid, reason: NOT_REGISTERED_REASON });
		} catch (error) {
			failed.push(failureOf(error, hostUid, sessionId, uid));
		}
	}

	return { removed, failed };
}

export const tablesRemoveParticipants = onCall(
	{ region: functionConfig.region, memory: '512MiB', timeoutSeconds: BATCH_TIMEOUT_SECONDS },
	async (
		request: CallableRequest<TablesRemoveParticipantsRequest>,
	): Promise<TablesRemoveParticipantsResponse> => {
		let uid: string | undefined;
		try {
			uid = actorFrom(request).uid;

			return await removeParticipants(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'tableAssignment.tablesRemoveParticipants',
				userId: uid,
				metadata: { sessionId: request.data?.sessionId, count: request.data?.uids?.length },
			});
		}
	},
);
