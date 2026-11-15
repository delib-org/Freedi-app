import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
	Collections,
	DEFAULT_GATE,
	campOf,
	functionConfig,
	supportBySide,
	tableAssignmentParticipantId,
} from '@freedi/shared-types';
import type {
	ClassRegistrationSupportRequest,
	ClassRegistrationSupportResponse,
	Statement,
	StatementSubscription,
	SupportSubscription,
	TableAssignmentParticipant,
} from '@freedi/shared-types';
import { db } from '../../db';
import {
	isWorkspaceAdmin,
	loadChallenge,
	requireId,
	requireUid,
	subscriptionRef,
} from '../classroomAccess';
import { ClassroomError, toHttpsError } from '../classroomErrors';
import { loadMembership } from '../classroomMembers';
import { loadConnectedLesson, registrationSeatsQuery } from './registrationAccess';
import type { RegistrationSeatDoc } from './registrationAccess';

function finiteNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** The gate the Summary compares support with: the challenge's, else the lesson's, else DEFAULT_GATE. */
function gateOf(challenge: Statement, main: Statement): number {
	return (
		finiteNumber(challenge.votingSettings?.threshold) ??
		finiteNumber(main.votingSettings?.threshold) ??
		DEFAULT_GATE
	);
}

/** A student sees support by side only when the teacher shows it to everyone. */
function supportShownToAll(challenge: Statement): boolean {
	const display = challenge.statementSettings?.voteDisplay;

	return display?.liveResults === true && display?.supportShown === true;
}

/**
 * `classRegistrationSupport` (the teacher; a student when support by side is
 * shown to everyone): "Support by side" of a connected lesson whose
 * registration asked the position question (IA tables-class-bridge 2.5).
 * Positions never leave the server and are never copied onto a member: they
 * are read here from the private registrations, turned into camps, and only
 * the totals per camp go out, under the registration's two poles.
 */
export async function registrationSupport(
	firestore: Firestore,
	uid: string,
	req: ClassRegistrationSupportRequest,
): Promise<ClassRegistrationSupportResponse> {
	const mainId = requireId(req?.mainId, 'mainId');
	const { main, session } = await loadConnectedLesson(firestore, mainId);
	const challenge = await loadChallenge(firestore, mainId);
	if (!(await isWorkspaceAdmin(firestore, mainId, uid, main))) {
		await loadMembership(firestore, mainId, uid, main);
		if (!supportShownToAll(challenge)) {
			throw new ClassroomError('permission-denied', 'Support by side is not shown yet');
		}
	}
	const question = session.settings.positionQuestion;
	if (!question) {
		throw new ClassroomError('failed-precondition', 'The registration asked no position');
	}

	const ledger = (await registrationSeatsQuery(firestore, mainId).get()).docs
		.map((d) => d.data() as RegistrationSeatDoc)
		.filter((doc): doc is RegistrationSeatDoc & { classUid: string } => Boolean(doc.classUid));
	const participantRefs = ledger.map((doc) =>
		firestore
			.collection(Collections.tableAssignmentParticipants)
			.doc(tableAssignmentParticipantId(session.tableAssignmentId, doc.registrationUid)),
	);
	const subRefs = ledger.map((doc) => subscriptionRef(firestore, mainId, doc.classUid));
	const [participants, subs] = await Promise.all([
		participantRefs.length > 0 ? firestore.getAll(...participantRefs) : Promise.resolve([]),
		subRefs.length > 0 ? firestore.getAll(...subRefs) : Promise.resolve([]),
	]);
	const rated: SupportSubscription[] = ledger.flatMap((_, i) => {
		const position = (participants[i].data() as TableAssignmentParticipant | undefined)?.position;
		if (position === undefined) return [];
		const sub = subs[i].data() as StatementSubscription | undefined;

		return [{ camp: campOf(position), decisionSupport: sub?.decisionSupport }];
	});

	return {
		poleA: question.poleA,
		poleB: question.poleB,
		support: supportBySide(rated, gateOf(challenge, main)),
	};
}

export const classRegistrationSupport = onCall(
	{ region: functionConfig.region },
	async (
		request: CallableRequest<ClassRegistrationSupportRequest>,
	): Promise<ClassRegistrationSupportResponse> => {
		let uid: string | undefined;
		try {
			uid = requireUid(request);

			return await registrationSupport(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'classroom.classRegistrationSupport',
				userId: uid,
				statementId: request.data?.mainId,
			});
		}
	},
);
