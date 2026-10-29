import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { cleanClassName, functionConfig } from '@freedi/shared-types';
import type {
	ClassStartLessonRequest,
	ClassStartLessonResponse,
	Statement,
	User,
} from '@freedi/shared-types';
import { db } from '../db';
import { requireId, requireUid } from './classroomAccess';
import { ClassroomError, toHttpsError } from './classroomErrors';
import { classHomeTarget, teacherHomeTarget } from './classHome';
import { actorUserOf, loadOwnGame, loadOwnPlan } from './classPlanAccess';
import { requireGameSnapshot } from './cloneLesson';
import { startLessonUnderHome } from './startLesson';
import type { StartLessonDeps } from './startLesson';

/**
 * `classStartLesson` (IA docs/ia/join-class-lesson-plan.md 9.2): plays a prepared
 * game with a class. The caller must own the plan and the game; with a `classId`
 * the caller must teach that Agora class and the class must be active. The lesson
 * goes under the class home (`jcClass_{classId}`), or under the caller's teacher
 * home (`jcTeacher_{uid}`) when `classId` is null. See startLesson.ts for the
 * transaction. A retry with the same `newMainId` returns the same lesson.
 */

function requireClassId(value: unknown): string | null {
	if (value === null || value === undefined) return null;

	return requireId(value, 'classId');
}

export async function startLesson(
	firestore: Firestore,
	actor: User,
	req: ClassStartLessonRequest,
	deps: StartLessonDeps = {},
): Promise<ClassStartLessonResponse> {
	const planId = requireId(req?.planId, 'planId');
	const gameId = requireId(req?.gameId, 'gameId');
	const newMainId = requireId(req?.newMainId, 'newMainId');
	const classId = requireClassId(req?.classId);

	// Ownership first: nothing of the game is used for someone else.
	await loadOwnPlan(firestore, actor.uid, planId);
	const game = await loadOwnGame(firestore, actor.uid, planId, gameId);
	const snapshot = requireGameSnapshot(game.snapshot);
	const target = classId
		? await classHomeTarget(firestore, actor.uid, classId)
		: teacherHomeTarget(actor);
	if (!game.title?.trim()) throw new ClassroomError('failed-precondition', 'The game has no name');

	return startLessonUnderHome(
		firestore,
		{
			actor,
			target,
			newMainId,
			title: game.title,
			snapshot,
			classLesson: {
				planId,
				gameId,
				classId: target.classId,
				className: cleanClassName(target.className),
			},
			isRetryOf: (found: Statement) =>
				found.creatorId === actor.uid &&
				found.statementSettings?.classLesson?.gameId === gameId &&
				found.statementSettings?.classLesson?.planId === planId,
		},
		deps,
	);
}

export const classStartLesson = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<ClassStartLessonRequest>): Promise<ClassStartLessonResponse> => {
		let uid: string | undefined;
		try {
			uid = requireUid(request);

			return await startLesson(db, actorUserOf(request, uid), request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'classroom.classStartLesson',
				userId: uid,
				metadata: {
					planId: request.data?.planId,
					gameId: request.data?.gameId,
					classId: request.data?.classId,
					newMainId: request.data?.newMainId,
				},
			});
		}
	},
);
