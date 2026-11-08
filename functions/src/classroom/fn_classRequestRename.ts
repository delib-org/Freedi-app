import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { Role, functionConfig } from '@freedi/shared-types';
import type {
	ClassRequestRenameRequest,
	ClassRequestRenameResponse,
	StatementSubscription,
} from '@freedi/shared-types';
import { db } from '../db';
import { assertWorkspaceAdmin, requireId, requireUid, subscriptionRef } from './classroomAccess';
import { ClassroomError, toHttpsError } from './classroomErrors';
import { assertLessonNotEnded } from './lessonStatusGuard';

/**
 * `classRequestRename` (admin): ask one student for a new name. Sets
 * `renameRequested: true` on their subscription; their phone then opens a name
 * form that blocks the screen until they save a name (which clears the flag).
 * Works at every step and while the lesson is paused; an ended lesson is closed.
 */

export async function requestRename(
	firestore: Firestore,
	actorUid: string,
	req: ClassRequestRenameRequest,
): Promise<ClassRequestRenameResponse> {
	const mainId = requireId(req?.mainId, 'mainId');
	const uid = requireId(req?.uid, 'uid');
	const main = await assertWorkspaceAdmin(firestore, mainId, actorUid);
	assertLessonNotEnded(main);

	const ref = subscriptionRef(firestore, mainId, uid);
	const snap = await ref.get();
	if (!snap.exists) throw new ClassroomError('not-found', 'This student has not joined the lesson');
	const sub = snap.data() as StatementSubscription;
	if (sub.role === Role.admin || sub.role === Role.creator) {
		throw new ClassroomError('failed-precondition', 'A teacher cannot be asked for a new name');
	}
	await ref.update({ renameRequested: true, lastUpdate: Date.now() });

	return { ok: true };
}

export const classRequestRename = onCall(
	{ region: functionConfig.region },
	async (
		request: CallableRequest<ClassRequestRenameRequest>,
	): Promise<ClassRequestRenameResponse> => {
		let uid: string | undefined;
		try {
			uid = requireUid(request);

			return await requestRename(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'classroom.classRequestRename',
				userId: uid,
				statementId: request.data?.mainId,
				metadata: { student: request.data?.uid },
			});
		}
	},
);
