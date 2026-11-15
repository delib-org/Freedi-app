import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { functionConfig, isTableAssignmentSplitByTopic } from '@freedi/shared-types';
import type {
	TableAssignment,
	TableAssignmentStatus,
	TablesSetStatusRequest,
	TablesSetStatusResponse,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { db } from '../db';
import { closeAndPublishSplit } from './directClose';
import type { DirectCloseResult } from './directClose';
import { eraseSessionAnswers } from './sessionData';
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
 * Allowed moves. `published` is reached through tablesPublishRun, or by
 * closing a splitByTopic session; a published session can still be ended.
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

/**
 * The session has already ended whatever happens here, so a failure is logged
 * and reported in the response instead of failing a status change that held.
 */
async function eraseAfterEnd(
	firestore: Firestore,
	session: TableAssignment,
	uid: string,
	now: number,
): Promise<boolean> {
	try {
		await eraseSessionAnswers(firestore, session, now);

		return true;
	} catch (error) {
		logError(error, {
			operation: 'tableAssignment.eraseSessionAnswers',
			userId: uid,
			metadata: { sessionId: session.tableAssignmentId },
		});

		return false;
	}
}

/**
 * `tablesSetStatus` (host): draft -> registrationOpen -> registrationClosed ->
 * ended, nothing else. Ending erases the answers once the status is committed,
 * and no answer can arrive after that. Asking for `ended` again retries an
 * erase that failed and changes nothing else.
 *
 * A splitByTopic session skips `registrationClosed`: closing it splits every
 * topic into tables and publishes them in the same transaction (IA
 * tables-class-bridge 2.3), so its answer is `published`. Class's
 * classCloseRegistration calls this function too.
 */
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

	const { session, published } = await firestore.runTransaction(async (tx) => {
		const current = await readSession(tx, firestore, sessionId);
		assertHost(current, uid);
		const unchanged: { session: TableAssignment; published?: DirectCloseResult } = {
			session: current,
		};
		if (current.status === 'ended' && next === 'ended') return unchanged;
		if (!TRANSITIONS[current.status].includes(next)) {
			throw new TablesError('failed-precondition', `Cannot move from ${current.status} to ${next}`);
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
		if (next === 'registrationClosed' && isTableAssignmentSplitByTopic(current)) {
			return {
				session: current,
				published: await closeAndPublishSplit(tx, firestore, current, now),
			};
		}
		tx.update(sessionRef(firestore, sessionId), { status: next, lastUpdate: now });

		return unchanged;
	});
	if (published) return { status: 'published', ...published };
	if (next !== 'ended') return { status: next };
	const answersErased =
		session.answersErasedAt !== undefined || (await eraseAfterEnd(firestore, session, uid, now));

	return { status: next, answersErased };
}

export const tablesSetStatus = onCall(
	{ region: functionConfig.region, timeoutSeconds: 120, memory: '512MiB' },
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
