import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { functionConfig } from '@freedi/shared-types';
import type { ClassSnapshotGameRequest, ClassSnapshotGameResponse } from '@freedi/shared-types';
import { db } from '../db';
import { isWorkspaceAdmin, loadMain, requireId, requireUid } from './classroomAccess';
import { ClassroomError, toHttpsError } from './classroomErrors';
import { cleanTitle, loadLessonChildren, writeGameFromLesson } from './gameWrites';
import { isLesson, lessonSnapshot } from './cloneLesson';

/**
 * `classSnapshotGame` (IA 9.2): turns a lesson's questions and settings into a
 * game doc `classPlans/{planId}/games/{newGameId}`. The caller must be an admin
 * of the lesson and own the plan. When `planId === sourceMainId` and no plan
 * exists, the plan is made from the lesson (an old lesson becomes its own plan,
 * IA 11.11). A retry with the same `newGameId` returns the same game.
 */

export async function snapshotGame(
	firestore: Firestore,
	actorUid: string,
	req: ClassSnapshotGameRequest,
	now: () => number = Date.now,
): Promise<ClassSnapshotGameResponse> {
	const sourceId = requireId(req?.sourceMainId, 'sourceMainId');
	const planId = requireId(req?.planId, 'planId');
	const gameId = requireId(req?.newGameId, 'newGameId');

	// Ownership first: nothing below the lesson is read for someone else.
	const source = await loadMain(firestore, sourceId);
	if (!(await isWorkspaceAdmin(firestore, sourceId, actorUid, source))) {
		throw new ClassroomError('permission-denied', 'You can only copy your own lessons');
	}
	if (!isLesson(source)) throw new ClassroomError('failed-precondition', 'This is not a lesson');
	const title = cleanTitle(req?.title, source.statement);
	const snapshot = lessonSnapshot(source, await loadLessonChildren(firestore, sourceId));
	const at = now();

	return writeGameFromLesson(firestore, {
		planId,
		gameId,
		ownerUid: actorUid,
		title,
		snapshot,
		sourceMainId: sourceId,
		planIfMissing:
			planId === sourceId
				? {
						planId,
						title: cleanTitle(undefined, source.statement),
						ownerUid: actorUid,
						createdAt: at,
						lastUpdate: at,
					}
				: null,
		now: at,
	});
}

export const classSnapshotGame = onCall(
	{ region: functionConfig.region },
	async (
		request: CallableRequest<ClassSnapshotGameRequest>,
	): Promise<ClassSnapshotGameResponse> => {
		let uid: string | undefined;
		try {
			uid = requireUid(request);

			return await snapshotGame(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'classroom.classSnapshotGame',
				userId: uid,
				statementId: request.data?.sourceMainId,
				metadata: { planId: request.data?.planId, newGameId: request.data?.newGameId },
			});
		}
	},
);
