import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { Collections, functionConfig, supportBySide } from '@freedi/shared-types';
import type {
	ClassSupportBySideRequest,
	ClassSupportBySideResponse,
	Statement,
	StatementSubscription,
	SupportSubscription,
} from '@freedi/shared-types';
import { db } from '../db';
import {
	ADMIN_ROLES,
	isWorkspaceAdmin,
	loadChallenge,
	loadMain,
	requireId,
	requireUid,
} from './classroomAccess';
import { ClassroomError, toHttpsError } from './classroomErrors';
import { loadMembership } from './classroomMembers';
import { sidesOf } from './classSides';
import { gateOf, supportShownToAll, supportStepOpen } from './supportAccess';

/**
 * `classSupportBySide` (the teacher; a student when support by side is shown to
 * everyone), only at the Vote and Summary steps: the lesson's own "support by
 * side" (Trello btMVQMM5). The sides and the support are private
 * (classSides/{uid}--{mainId}); they are read here and only the totals per camp
 * go out, the same SupportBySide the phones, the projector and the teacher's
 * panel used to compute from the roster.
 */

/** A student of the lesson: not its creator, not an admin. */
function isStudent(sub: StatementSubscription, main: Statement): boolean {
	return sub.userId !== main.creatorId && !ADMIN_ROLES.has(sub.role);
}

export async function lessonSupportBySide(
	firestore: Firestore,
	uid: string,
	req: ClassSupportBySideRequest,
): Promise<ClassSupportBySideResponse> {
	const mainId = requireId(req?.mainId, 'mainId');
	const main = await loadMain(firestore, mainId);
	const challenge = await loadChallenge(firestore, mainId);
	if (!(await isWorkspaceAdmin(firestore, mainId, uid, main))) {
		await loadMembership(firestore, mainId, uid, main);
		if (!supportShownToAll(challenge)) {
			throw new ClassroomError('permission-denied', 'Support by side is not shown yet');
		}
	}
	if (!supportStepOpen(main)) {
		throw new ClassroomError(
			'failed-precondition',
			'Support by side is shown at Vote and Summary only',
		);
	}

	const subsSnap = await firestore
		.collection(Collections.statementsSubscribe)
		.where('statementId', '==', mainId)
		.get();
	const students = subsSnap.docs
		.map((d) => d.data() as StatementSubscription)
		.filter((sub) => typeof sub.userId === 'string' && isStudent(sub, main));
	const sides = await sidesOf(firestore, mainId, students);
	const rated: SupportSubscription[] = students.map((sub) => {
		const { camp, decisionSupport } = sides.get(sub.userId) ?? {};

		return { camp, decisionSupport };
	});

	return { support: supportBySide(rated, gateOf(challenge, main)) };
}

export const classSupportBySide = onCall(
	{ region: functionConfig.region, memory: '512MiB' },
	async (
		request: CallableRequest<ClassSupportBySideRequest>,
	): Promise<ClassSupportBySideResponse> => {
		let uid: string | undefined;
		try {
			uid = requireUid(request);

			return await lessonSupportBySide(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'classroom.classSupportBySide',
				userId: uid,
				statementId: request.data?.mainId,
			});
		}
	},
);
