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
	TableAssignmentCounter,
	TableAssignmentParticipant,
	TableAssignmentRosterEntry,
	TablesNameMatch,
	TablesRegisterRequest,
	TablesRegisterResponse,
} from '@freedi/shared-types';
import { db } from '../db';
import {
	FULL_NAME_MIN_LENGTH,
	REGISTRATION_CAP_MAX,
	REGISTRATION_CAP_MIN,
	REGISTRATION_CAP_PER_EXPECTED,
} from './constants';
import { deleteRegistrationRecords } from './removeRegistration';
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
import { cleanText, requireText, withoutUndefined } from './validation';

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

/** How many may register: scales with what the host expects, within fixed bounds. */
export function registrationCap(expectedParticipants: number | undefined): number {
	const scaled = (expectedParticipants ?? 0) * REGISTRATION_CAP_PER_EXPECTED;

	return Math.min(REGISTRATION_CAP_MAX, Math.max(REGISTRATION_CAP_MIN, scaled));
}

/** The one other registration this name could continue, or undefined when the rule does not apply. */
async function findNamesake(
	tx: Transaction,
	firestore: Firestore,
	session: TableAssignment,
	fullName: string,
): Promise<TableAssignmentParticipant | undefined> {
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
	const record = await tx.get(
		participantRef(firestore, tableAssignmentParticipantId(sessionId, uid)),
	);

	return record.data() as TableAssignmentParticipant | undefined;
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
 * A registered caller registering again. Once tables are public a name is what
 * people were told, and a taken-over registration keeps the name that won it,
 * or a claim could be used to take a seat and then hide under another name.
 */
function updateName(
	tx: Transaction,
	firestore: Firestore,
	session: TableAssignment,
	stored: TableAssignmentParticipant,
	fullName: string,
): TablesRegisterResponse {
	if (!stored.claimedByName && session.status !== 'published') {
		return saveRegistration(tx, firestore, { ...stored, fullName });
	}
	if (tableAssignmentNameKey(fullName) !== tableAssignmentNameKey(cleanText(stored.fullName))) {
		throw stored.claimedByName
			? new TablesError(
					'failed-precondition',
					'A registration continued by full name cannot be renamed',
					'claimed-by-name',
				)
			: new TablesError(
					'failed-precondition',
					'Names cannot change once the tables are published',
					'name-locked',
				);
	}

	return { outcome: 'registered', participant: stored };
}

/** Takes the namesake's place: its answers are gone, its seat and its place in the count stay. */
function claimRegistration(
	tx: Transaction,
	firestore: Firestore,
	namesake: TableAssignmentParticipant,
	fresh: TableAssignmentParticipant,
): TablesRegisterResponse {
	deleteRegistrationRecords(tx, firestore, namesake);

	return saveRegistration(
		tx,
		firestore,
		withoutUndefined({
			...fresh,
			claimedByName: true,
			chosenTableIndex: namesake.chosenTableIndex,
		}),
	);
}

/**
 * `tablesRegister` (any signed-in caller, anonymous included): upserts the
 * caller's private record and name card. Allowed while registration is open,
 * and after publishing so latecomers can still register (they stay unseated
 * until the host publishes a new run). Registering again only updates the
 * name; preferences, position, table and the claim flag are kept. No rename
 * once published, nor of a registration taken over by name.
 *
 * Return by full name: a caller who is not registered yet, typing a name that
 * exactly one other registration has, in a session with the setting on and
 * registration open, chooses through `nameMatch`. A claim replaces that
 * registration with an empty one: the old answers are gone and the caller
 * never receives them. A direct-mode seat passes to the caller, so the seat
 * counter and the count stay as they were, one person in, one out.
 *
 * The counter is a blind increment, so a crowd registering at once does not
 * make every transaction contend on the same document. For the same reason
 * the registration cap reads the count before the transaction: it is a soft
 * limit that a burst can pass by a little, there to stop a flood. Only a new
 * registration is refused; an update or a claim adds nobody.
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
	const counter = await counterRef(firestore, sessionId).get();
	const registeredSoFar = (counter.data() as TableAssignmentCounter | undefined)?.registered ?? 0;

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
			return updateName(
				tx,
				firestore,
				session,
				snap.data() as TableAssignmentParticipant,
				fullName,
			);
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
		if (namesake && nameMatch === 'claim') return claimRegistration(tx, firestore, namesake, fresh);
		if (registeredSoFar >= registrationCap(session.settings.expectedParticipants)) {
			throw new TablesError(
				'failed-precondition',
				'This session has reached its registration limit',
				'registration-full',
			);
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
