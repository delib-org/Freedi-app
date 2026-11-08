import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { functionConfig, tableAssignmentParticipantId } from '@freedi/shared-types';
import type {
	TableAssignmentParticipant,
	TableAssignmentTopic,
	TablesJoinTableRequest,
	TablesJoinTableResponse,
} from '@freedi/shared-types';
import { db } from '../db';
import { buildDirectLayout } from './directLayout';
import {
	actorFrom,
	participantRef,
	readSession,
	requireId,
	seatRef,
	sortTopics,
	topicsQuery,
} from './tablesAccess';
import { TablesError, toHttpsError } from './tablesErrors';

interface SeatDoc {
	sessionId: string;
	tableIndex: number;
	topicId: string;
	/** Seats taken. Only ever changed inside a transaction that also read it. */
	count: number;
}

/**
 * `tablesJoinTable` (the participant themself, direct mode): take a seat at
 * `tableIndex`, freeing the previous one.
 *
 * Atomicity: every table has a seat-counter doc. The transaction reads the
 * session, topics, the participant, the target counter and (when moving) the
 * old counter, checks `count < tableSize`, then writes the new counters and
 * the participant's `chosenTableIndex` together. Firestore re-runs a
 * transaction whose read docs changed, so two joiners racing for the last
 * seat cannot both pass the check: the loser re-reads a full table and fails
 * with `failed-precondition` (reason `table-full`) and keeps any old seat.
 */
export async function joinTable(
	firestore: Firestore,
	uid: string,
	req: TablesJoinTableRequest,
): Promise<TablesJoinTableResponse> {
	const sessionId = requireId(req?.sessionId, 'sessionId');
	const tableIndex = req.tableIndex;
	if (typeof tableIndex !== 'number' || !Number.isInteger(tableIndex) || tableIndex < 0) {
		throw new TablesError('invalid-argument', 'tableIndex must be a whole number');
	}
	const pRef = participantRef(firestore, tableAssignmentParticipantId(sessionId, uid));

	return firestore.runTransaction(async (tx) => {
		const session = await readSession(tx, firestore, sessionId);
		if (session.mode !== 'direct') {
			throw new TablesError(
				'failed-precondition',
				'Tables are not chosen directly in this session',
			);
		}
		if (session.status !== 'registrationOpen') {
			throw new TablesError(
				'failed-precondition',
				'Registration is not open',
				'registration-closed',
			);
		}
		const [pSnap, topicsSnap] = await Promise.all([
			tx.get(pRef),
			tx.get(topicsQuery(firestore, sessionId)),
		]);
		if (!pSnap.exists)
			throw new TablesError('failed-precondition', 'Register before choosing a table');
		const participant = pSnap.data() as TableAssignmentParticipant;

		const topics = sortTopics(topicsSnap.docs.map((d) => d.data() as TableAssignmentTopic));
		const target = buildDirectLayout(topics).find((t) => t.tableIndex === tableIndex);
		if (!target) throw new TablesError('invalid-argument', 'No such table');
		if (participant.chosenTableIndex === tableIndex) {
			return { tableIndex, topicId: target.topicId };
		}

		const previous = participant.chosenTableIndex;
		const [targetSnap, previousSnap] = await Promise.all([
			tx.get(seatRef(firestore, sessionId, tableIndex)),
			previous === undefined
				? Promise.resolve(undefined)
				: tx.get(seatRef(firestore, sessionId, previous)),
		]);
		const taken = targetSnap.exists ? (targetSnap.data() as SeatDoc).count : 0;
		if (taken >= session.settings.tableSize) {
			throw new TablesError('failed-precondition', 'That table is full', 'table-full');
		}

		// ---- writes (all reads are done) ----
		const seat: SeatDoc = { sessionId, tableIndex, topicId: target.topicId, count: taken + 1 };
		tx.set(seatRef(firestore, sessionId, tableIndex), seat);
		if (previous !== undefined && previousSnap?.exists) {
			const old = previousSnap.data() as SeatDoc;
			tx.set(seatRef(firestore, sessionId, previous), {
				...old,
				count: Math.max(0, old.count - 1),
			});
		}
		tx.set(pRef, { ...participant, chosenTableIndex: tableIndex });

		return { tableIndex, topicId: target.topicId };
	});
}

export const tablesJoinTable = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<TablesJoinTableRequest>): Promise<TablesJoinTableResponse> => {
		let uid: string | undefined;
		try {
			uid = actorFrom(request).uid;

			return await joinTable(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'tableAssignment.tablesJoinTable',
				userId: uid,
				metadata: { sessionId: request.data?.sessionId, tableIndex: request.data?.tableIndex },
			});
		}
	},
);
