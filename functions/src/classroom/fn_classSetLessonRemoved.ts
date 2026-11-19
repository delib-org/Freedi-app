import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { Collections, functionConfig, isLessonRemovable } from '@freedi/shared-types';
import type {
	ClassSetLessonRemovedRequest,
	ClassSetLessonRemovedResponse,
	Statement,
} from '@freedi/shared-types';
import { db } from '../db';
import { isWorkspaceAdmin, requireId, requireUid } from './classroomAccess';
import { ClassroomError, toHttpsError } from './classroomErrors';

/**
 * `classSetLessonRemoved` (admin): takes a lesson off the teacher's lists, or
 * puts it back (docs/ia/join-class-remove-lessons.md). Sets or clears
 * `statementSettings.lessonRemovedAt`; nothing is deleted and students see no
 * difference. Only a lesson that ended or has not started may be removed
 * (`isLessonRemovable`, shared with the client). Repeats are no-ops, so a retry
 * after a lost reply is safe. A restore is never refused.
 */
export async function setLessonRemoved(
	firestore: Firestore,
	actorUid: string,
	req: ClassSetLessonRemovedRequest,
	now: () => number = Date.now,
): Promise<ClassSetLessonRemovedResponse> {
	const mainId = requireId(req?.mainId, 'mainId');
	if (typeof req.removed !== 'boolean') {
		throw new ClassroomError('invalid-argument', 'removed must be true or false');
	}
	const removed = req.removed;
	const mainRef = firestore.collection(Collections.statements).doc(mainId);

	return firestore.runTransaction(async (tx) => {
		const snap = await tx.get(mainRef);
		if (!snap.exists) throw new ClassroomError('not-found', 'Lesson not found');
		const main = snap.data() as Statement;
		if (!(await isWorkspaceAdmin(firestore, mainId, actorUid, main))) {
			throw new ClassroomError('permission-denied', "Only the lesson's teacher can do this");
		}
		const plan = main.statementSettings?.lessonPlan;
		if (!plan) throw new ClassroomError('failed-precondition', 'This is not a lesson');
		const current = main.statementSettings?.lessonRemovedAt;

		if (!removed) {
			if (typeof current === 'number') {
				tx.update(mainRef, {
					'statementSettings.lessonRemovedAt': FieldValue.delete(),
					lastUpdate: now(),
				});
			}

			return { removed: false };
		}
		if (typeof current === 'number') return { removed: true, removedAt: current };
		if (!isLessonRemovable(plan)) {
			throw new ClassroomError(
				'failed-precondition',
				'A lesson that is running cannot be removed',
				'lesson-running',
			);
		}
		const at = now();
		tx.update(mainRef, { 'statementSettings.lessonRemovedAt': at, lastUpdate: at });

		return { removed: true, removedAt: at };
	});
}

export const classSetLessonRemoved = onCall(
	{ region: functionConfig.region },
	async (
		request: CallableRequest<ClassSetLessonRemovedRequest>,
	): Promise<ClassSetLessonRemovedResponse> => {
		let uid: string | undefined;
		try {
			uid = requireUid(request);

			return await setLessonRemoved(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'classroom.classSetLessonRemoved',
				userId: uid,
				statementId: request.data?.mainId,
				metadata: { removed: request.data?.removed },
			});
		}
	},
);
