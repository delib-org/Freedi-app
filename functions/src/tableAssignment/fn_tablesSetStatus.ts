import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { functionConfig } from '@freedi/shared-types';
import type {
	TableAssignmentStatus,
	TablesSetStatusRequest,
	TablesSetStatusResponse,
} from '@freedi/shared-types';
import { db } from '../db';
import {
	actorFrom,
	assertHost,
	readSession,
	requireId,
	sessionRef,
	topicsQuery,
} from './tablesAccess';
import { TablesError, toHttpsError } from './tablesErrors';

/**
 * Allowed moves. `published` is reached only through tablesPublishRun, but a
 * published session can still be ended.
 */
const TRANSITIONS: Readonly<Record<TableAssignmentStatus, readonly TableAssignmentStatus[]>> = {
	draft: ['registrationOpen'],
	registrationOpen: ['registrationClosed'],
	registrationClosed: ['ended'],
	published: ['ended'],
	ended: [],
};

const SETTABLE: readonly TableAssignmentStatus[] = [
	'registrationOpen',
	'registrationClosed',
	'ended',
];

/** `tablesSetStatus` (host): draft -> registrationOpen -> registrationClosed -> ended, nothing else. */
export async function setStatus(
	firestore: Firestore,
	uid: string,
	req: TablesSetStatusRequest,
	now: number = Date.now(),
): Promise<TablesSetStatusResponse> {
	const sessionId = requireId(req?.sessionId, 'sessionId');
	const next = req.status;
	if (!SETTABLE.includes(next)) {
		throw new TablesError(
			'invalid-argument',
			'status must be registrationOpen, registrationClosed or ended',
		);
	}

	return firestore.runTransaction(async (tx) => {
		const session = await readSession(tx, firestore, sessionId);
		assertHost(session, uid);
		if (!TRANSITIONS[session.status].includes(next)) {
			throw new TablesError('failed-precondition', `Cannot move from ${session.status} to ${next}`);
		}
		if (next === 'registrationOpen') {
			const topics = await tx.get(topicsQuery(firestore, sessionId));
			if (topics.empty) {
				throw new TablesError(
					'failed-precondition',
					'Add at least one topic before opening registration',
				);
			}
		}
		tx.update(sessionRef(firestore, sessionId), { status: next, lastUpdate: now });

		return { status: next };
	});
}

export const tablesSetStatus = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<TablesSetStatusRequest>): Promise<TablesSetStatusResponse> => {
		let uid: string | undefined;
		try {
			uid = actorFrom(request).uid;

			return await setStatus(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'tableAssignment.tablesSetStatus',
				userId: uid,
				metadata: { sessionId: request.data?.sessionId, status: request.data?.status },
			});
		}
	},
);
