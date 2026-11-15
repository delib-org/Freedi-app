import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
	Collections,
	TABLE_ASSIGNMENT_FULL_NAME_MAX_LENGTH,
	functionConfig,
	tableAssignmentNameKey,
} from '@freedi/shared-types';
import type {
	ClassArriveByNameRequest,
	ClassArriveByNameResponse,
	ClassNameAnswer,
	ClassNameChoice,
	TableAssignmentRosterEntry,
} from '@freedi/shared-types';
import { db } from '../../db';
import { FULL_NAME_MIN_LENGTH } from '../../tableAssignment/constants';
import { cleanText } from '../../tableAssignment/validation';
import { requireId, requireUid } from '../classroomAccess';
import { ClassroomError, toHttpsError } from '../classroomErrors';
import { arriveOnRegistration, joinWithoutRegistration } from './arrival';
import { loadConnectedLesson, registrationSeatRef } from './registrationAccess';
import type { ConnectedLesson, RegistrationSeatDoc } from './registrationAccess';

/** Three results are enough to know a name is shared. */
const NAME_MATCH_LIMIT = 3;
const ANSWER_KINDS: readonly ClassNameAnswer['kind'][] = [
	'itsMe',
	'someoneElse',
	'pick',
	'joinWithout',
];

function requireFullName(value: unknown): string {
	const name = typeof value === 'string' ? cleanText(value) : '';
	if (name.length < FULL_NAME_MIN_LENGTH || name.length > TABLE_ASSIGNMENT_FULL_NAME_MAX_LENGTH) {
		throw new ClassroomError(
			'invalid-argument',
			`fullName must be ${FULL_NAME_MIN_LENGTH} to ${TABLE_ASSIGNMENT_FULL_NAME_MAX_LENGTH} characters`,
		);
	}

	return name;
}

function parseAnswer(value: unknown): ClassNameAnswer | undefined {
	if (value === undefined || value === null) return undefined;
	const kind = (value as { kind?: unknown }).kind;
	if (!ANSWER_KINDS.includes(kind as ClassNameAnswer['kind'])) {
		throw new ClassroomError('invalid-argument', 'answer is not valid');
	}
	if (kind === 'pick') {
		return { kind, seatId: requireId((value as { seatId?: unknown }).seatId, 'answer.seatId') };
	}

	return { kind } as ClassNameAnswer;
}

interface NameMatch {
	registrationUid: string;
	fullName: string;
	ledger: RegistrationSeatDoc | undefined;
}

/** Registrations with exactly this name key (tableAssignmentNameKey: no fuzzy matching). */
async function findRegistrations(
	firestore: Firestore,
	connected: ConnectedLesson,
	nameKey: string,
): Promise<NameMatch[]> {
	const roster = await firestore
		.collection(Collections.tableAssignmentRoster)
		.where('sessionId', '==', connected.session.tableAssignmentId)
		.where('nameKey', '==', nameKey)
		.limit(NAME_MATCH_LIMIT)
		.get();
	const entries = roster.docs.map((d) => d.data() as TableAssignmentRosterEntry);
	const ledgers = await Promise.all(
		entries.map((e) => registrationSeatRef(firestore, connected.main.statementId, e.uid).get()),
	);

	return entries.map((entry, i) => ({
		registrationUid: entry.uid,
		fullName: entry.fullName,
		ledger: ledgers[i].data() as RegistrationSeatDoc | undefined,
	}));
}

/** Two registrations share the name: they choose by table number and topic, nothing else. */
function choicesOf(matches: readonly NameMatch[]): ClassNameChoice[] {
	return matches.flatMap(({ ledger }) =>
		ledger?.tableN === undefined
			? []
			: [
					{
						seatId: ledger.seatId,
						tableN: ledger.tableN,
						...(ledger.topic ? { topic: ledger.topic } : {}),
					},
				],
	);
}

/**
 * `classArriveByName` (any signed-in caller): the name gate of a connected
 * lesson, "כתבו שם מלא, כמו בהרשמה" (IA tables-class-bridge 5.2). Four
 * outcomes: one free match seats at once; one match another device holds asks
 * "זה אתם?"; two matches choose by table (or wait for the tables); none offers
 * to fix the name or join without registration. Nobody becomes a walk-in
 * without saying so.
 */
export async function arriveByName(
	firestore: Firestore,
	callerUid: string,
	req: ClassArriveByNameRequest,
	now: number = Date.now(),
): Promise<ClassArriveByNameResponse> {
	const mainId = requireId(req?.mainId, 'mainId');
	const typed = requireFullName(req?.fullName);
	const answer = parseAnswer(req?.answer);
	const connected = await loadConnectedLesson(firestore, mainId);
	const join = async (): Promise<ClassArriveByNameResponse> => ({
		outcome: 'joined',
		...(await joinWithoutRegistration(firestore, connected, callerUid, typed, now)),
	});
	const seat = async (match: NameMatch): Promise<ClassArriveByNameResponse> => ({
		outcome: 'seated',
		...(await arriveOnRegistration(firestore, {
			connected,
			registrationUid: match.registrationUid,
			fullName: match.fullName,
			callerUid,
			now,
		})),
	});

	if (answer?.kind === 'joinWithout' || answer?.kind === 'someoneElse') return join();
	const matches = await findRegistrations(firestore, connected, tableAssignmentNameKey(typed));
	if (matches.length === 0) return { outcome: 'notFound' };

	if (matches.length === 1) {
		const [match] = matches;
		const holder = match.ledger?.classUid ?? match.ledger?.noDeviceId;
		const heldElsewhere = Boolean(holder) && holder !== callerUid;
		if (heldElsewhere && answer?.kind !== 'itsMe') return { outcome: 'nameTaken' };

		return seat(match);
	}

	if (connected.registration.seatingCopiedAt === undefined) {
		// In under the name for now; the choice comes once the tables are there.
		await joinWithoutRegistration(firestore, connected, callerUid, typed, now);

		return { outcome: 'nameTwiceLater' };
	}
	if (answer?.kind === 'pick') {
		const picked = matches.find((m) => m.ledger?.seatId === answer.seatId);
		if (!picked) throw new ClassroomError('not-found', 'No such seat for this name', 'seat-taken');

		return seat(picked);
	}

	return { outcome: 'nameTwice', choices: choicesOf(matches) };
}

export const classArriveByName = onCall(
	{ region: functionConfig.region, memory: '512MiB' },
	async (
		request: CallableRequest<ClassArriveByNameRequest>,
	): Promise<ClassArriveByNameResponse> => {
		let uid: string | undefined;
		try {
			uid = requireUid(request);

			return await arriveByName(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'classroom.classArriveByName',
				userId: uid,
				statementId: request.data?.mainId,
			});
		}
	},
);
