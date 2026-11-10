import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import {
	TABLE_ASSIGNMENT_FULL_NAME_MAX_LENGTH,
	functionConfig,
	tableAssignmentNameKey,
	tableAssignmentParticipantId,
} from '@freedi/shared-types';
import type {
	TableAssignment,
	TableAssignmentParticipant,
	TableAssignmentRosterEntry,
	TablesNameMatch,
	TablesRegisterRequest,
	TablesRegisterResponse,
} from '@freedi/shared-types';
import { db } from '../db';
import { FULL_NAME_MIN_LENGTH } from './constants';
import { deleteRegistration, loadRegistration } from './removeRegistration';
import type { LoadedRegistration } from './removeRegistration';
import { rosterEntryFrom } from './roster';
import {
	actorFrom,
	counterRef,
	participantRef,
	readSession,
	requireId,
	rosterByNameQuery,
	rosterRef,
} from './tablesAccess';
import { TablesError, toHttpsError } from './tablesErrors';
import { requireText } from './validation';

const NAME_MATCHES: readonly TablesNameMatch[] = ['ask', 'claim', 'separate'];
const NAME_MATCH_DEFAULT: TablesNameMatch = 'ask';
/** Two results are enough to know a name is not unique. */
const NAMESAKE_QUERY_LIMIT = 2;

function parseNameMatch(value: unknown): TablesNameMatch {
	if (value === undefined) return NAME_MATCH_DEFAULT;
	if (!NAME_MATCHES.includes(value as TablesNameMatch)) {
		throw new TablesError('invalid-argument', 'nameMatch must be ask, claim or separate');
	}

	return value as TablesNameMatch;
}

/** The one other registration this name could continue, or undefined when the rule does not apply. */
async function findNamesake(
	tx: Transaction,
	firestore: Firestore,
	session: TableAssignment,
	fullName: string,
): Promise<LoadedRegistration | undefined> {
	if (!session.settings.allowReturnByName || session.status !== 'registrationOpen') {
		return undefined;
	}
	const sessionId = session.tableAssignmentId;
	const nameKey = tableAssignmentNameKey(fullName);
	const matches = await tx.get(
		rosterByNameQuery(firestore, sessionId, nameKey).limit(NAMESAKE_QUERY_LIMIT),
	);
	if (matches.size !== 1) return undefined;

	const { uid } = matches.docs[0].data() as TableAssignmentRosterEntry;

	return loadRegistration(tx, firestore, sessionId, uid);
}

/** Writes the caller's private record and name card; the count is the caller's to change. */
function saveRegistration(
	tx: Transaction,
	firestore: Firestore,
	participant: TableAssignmentParticipant,
): TablesRegisterResponse {
	const id = tableAssignmentParticipantId(participant.sessionId, participant.uid);
	tx.set(participantRef(firestore, id), participant);
	tx.set(rosterRef(firestore, id), rosterEntryFrom(participant));

	return { outcome: 'registered', participant };
}

/**
 * `tablesRegister` (any signed-in caller, anonymous included): upserts the
 * caller's private record and name card. Allowed while registration is open,
 * and after publishing so latecomers can still register (they stay unseated
 * until the host publishes a new run). Registering again only updates the
 * name; preferences, position, table and the claim flag are kept.
 *
 * Return by full name: a caller who is not registered yet, typing a name that
 * exactly one other registration has, in a session with the setting on and
 * registration open, chooses through `nameMatch`. A claim replaces that
 * registration with an empty one: the old answers are gone and the caller
 * never receives them. The count stays as it was, one person in, one out.
 *
 * The counter is a blind increment, so a crowd registering at once does not
 * make every transaction contend on the same document.
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
	const nameMatch = parseNameMatch(req.nameMatch);
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
		if (snap.exists) {
			return saveRegistration(tx, firestore, {
				...(snap.data() as TableAssignmentParticipant),
				fullName,
			});
		}

		const fresh: TableAssignmentParticipant = {
			sessionId,
			uid,
			fullName,
			preferences: [],
			registeredAt: now,
		};
		const namesake = await findNamesake(tx, firestore, session, fullName);
		if (namesake && nameMatch === 'ask') return { outcome: 'nameExists' };
		if (namesake && nameMatch === 'claim') {
			deleteRegistration(tx, firestore, namesake);

			return saveRegistration(tx, firestore, { ...fresh, claimedByName: true });
		}

		tx.set(
			counterRef(firestore, sessionId),
			{ sessionId, registered: FieldValue.increment(1) },
			{ merge: true },
		);

		return saveRegistration(tx, firestore, fresh);
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
