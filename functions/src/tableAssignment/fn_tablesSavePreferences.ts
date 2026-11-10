import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
	TABLE_ASSIGNMENT_MAX_PREFERENCES,
	functionConfig,
	tableAssignmentParticipantId,
} from '@freedi/shared-types';
import type {
	TableAssignmentParticipant,
	TablesSavePreferencesRequest,
	TablesSavePreferencesResponse,
} from '@freedi/shared-types';
import { db } from '../db';
import { rosterEntryFrom } from './roster';
import {
	actorFrom,
	participantRef,
	readSession,
	requireId,
	rosterRef,
	topicsQuery,
} from './tablesAccess';
import { TablesError, toHttpsError } from './tablesErrors';
import { parsePosition, withoutUndefined } from './validation';

function parsePreferenceList(value: unknown): string[] {
	if (!Array.isArray(value) || value.length > TABLE_ASSIGNMENT_MAX_PREFERENCES) {
		throw new TablesError(
			'invalid-argument',
			`preferences must be a list of at most ${TABLE_ASSIGNMENT_MAX_PREFERENCES} topic ids`,
		);
	}
	const ids = value.map((v) => requireId(v, 'preference'));
	if (new Set(ids).size !== ids.length) {
		throw new TablesError('invalid-argument', 'preferences must be distinct');
	}

	return ids;
}

/**
 * `tablesSavePreferences` (the participant themself): up to three distinct
 * topic ids of this session, best first, plus an optional 0..100 position.
 * The call replaces both: leaving `position` out means "not specified" (never
 * the middle). Only while registration is open.
 */
export async function savePreferences(
	firestore: Firestore,
	uid: string,
	req: TablesSavePreferencesRequest,
): Promise<TablesSavePreferencesResponse> {
	const sessionId = requireId(req?.sessionId, 'sessionId');
	const preferences = parsePreferenceList(req.preferences);
	const position = parsePosition(req.position);
	const id = tableAssignmentParticipantId(sessionId, uid);
	const ref = participantRef(firestore, id);

	return firestore.runTransaction(async (tx) => {
		const session = await readSession(tx, firestore, sessionId);
		if (session.status !== 'registrationOpen') {
			throw new TablesError(
				'failed-precondition',
				'Registration is not open',
				'registration-closed',
			);
		}
		const [snap, topics] = await Promise.all([
			tx.get(ref),
			tx.get(topicsQuery(firestore, sessionId)),
		]);
		if (!snap.exists) {
			throw new TablesError('failed-precondition', 'Register before choosing');
		}
		const topicIds = new Set(topics.docs.map((d) => d.id));
		if (!preferences.every((id) => topicIds.has(id))) {
			throw new TablesError('invalid-argument', 'A preference is not a topic of this session');
		}

		// Build from the stored doc, dropping its old position: the call replaces it.
		const stored = { ...(snap.data() as TableAssignmentParticipant) };
		delete stored.position;
		const participant: TableAssignmentParticipant = withoutUndefined({
			...stored,
			preferences,
			position,
		});
		tx.set(ref, participant);
		tx.set(rosterRef(firestore, id), rosterEntryFrom(participant));

		return { participant };
	});
}

export const tablesSavePreferences = onCall(
	{ region: functionConfig.region },
	async (
		request: CallableRequest<TablesSavePreferencesRequest>,
	): Promise<TablesSavePreferencesResponse> => {
		let uid: string | undefined;
		try {
			uid = actorFrom(request).uid;

			return await savePreferences(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'tableAssignment.tablesSavePreferences',
				userId: uid,
				metadata: { sessionId: request.data?.sessionId },
			});
		}
	},
);
