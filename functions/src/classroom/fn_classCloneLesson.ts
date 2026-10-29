import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { functionConfig } from '@freedi/shared-types';
import type {
	ClassCloneLessonRequest,
	ClassCloneLessonResponse,
	ClassLessonLink,
	Statement,
	User,
} from '@freedi/shared-types';
import { db } from '../db';
import { isWorkspaceAdmin, loadMain, requireId, requireUid } from './classroomAccess';
import { ClassroomError, toHttpsError } from './classroomErrors';
import { teacherHomeTarget } from './classHome';
import { actorUserOf } from './classPlanAccess';
import { isLesson, lessonSnapshot } from './cloneLesson';
import { loadLessonChildren } from './gameWrites';
import { startLessonUnderHome } from './startLesson';
import type { StartLessonDeps } from './startLesson';

/**
 * `classCloneLesson` (admin of the source): a new lesson with the source's plan
 * (see @freedi/shared-types classGameSnapshot.ts for exactly what travels).
 * KEPT FOR OLD CLIENTS during the lesson-plan rollout (IA 9.2): re-implemented
 * as snapshot -> start, under the caller's teacher home `jcTeacher_{uid}`.
 * Remove it once no client calls it (delete the deployed function first).
 *
 * The caller must be an admin of the source (checked before any child is read).
 * `newMainId` comes from the client and makes a retry safe: the second call
 * finds the lesson and returns it.
 */

export { CLASS_CODE_MAX_ATTEMPTS as CLONE_CODE_MAX_ATTEMPTS } from './startLesson';
const MAX_TITLE_LENGTH = 200;

function optionalTitle(value: unknown): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== 'string' || value.length > MAX_TITLE_LENGTH) {
		throw new ClassroomError('invalid-argument', 'title is not valid');
	}

	return value;
}

/** The copy keeps the source's plan / game link; an old lesson is its own plan and game (IA 11.11). */
function linkOf(source: Statement): ClassLessonLink {
	const link = source.statementSettings?.classLesson;

	return {
		planId: link?.planId ?? source.statementId,
		gameId: link?.gameId ?? source.statementId,
		classId: null,
		className: '',
	};
}

function actorOf(source: Statement, actor: User): User {
	if (actor.displayName) return actor;
	if (source.creator?.uid === actor.uid)
		return { ...actor, displayName: source.creator.displayName };

	return actor;
}

export async function cloneLesson(
	firestore: Firestore,
	actor: User | string,
	req: ClassCloneLessonRequest,
	deps: StartLessonDeps = {},
): Promise<ClassCloneLessonResponse> {
	const actorUser: User = typeof actor === 'string' ? { uid: actor, displayName: '' } : actor;
	const sourceId = requireId(req?.sourceMainId, 'sourceMainId');
	const newMainId = requireId(req?.newMainId, 'newMainId');
	const title = optionalTitle(req?.title);
	if (sourceId === newMainId) {
		throw new ClassroomError('invalid-argument', 'newMainId must be a new id');
	}

	// Ownership first: nothing below the source is read for someone else.
	const source = await loadMain(firestore, sourceId);
	if (!(await isWorkspaceAdmin(firestore, sourceId, actorUser.uid, source))) {
		throw new ClassroomError('permission-denied', 'You can only copy your own lessons');
	}
	if (!isLesson(source)) throw new ClassroomError('failed-precondition', 'This is not a lesson');

	const snapshot = lessonSnapshot(source, await loadLessonChildren(firestore, sourceId));
	const creator = actorOf(source, actorUser);
	const res = await startLessonUnderHome(
		firestore,
		{
			actor: creator,
			target: teacherHomeTarget(creator),
			newMainId,
			title: title?.trim() ? title : source.statement,
			snapshot,
			classLesson: linkOf(source),
			sourceLesson: { id: sourceId, title: source.statement },
			isRetryOf: (found: Statement) =>
				found.creatorId === actorUser.uid && found.sourceLessonId === sourceId,
		},
		deps,
	);

	return { mainId: res.mainId, classCode: res.classCode, reused: res.reused, homeId: res.homeId };
}

export const classCloneLesson = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<ClassCloneLessonRequest>): Promise<ClassCloneLessonResponse> => {
		let uid: string | undefined;
		try {
			uid = requireUid(request);

			return await cloneLesson(db, actorUserOf(request, uid), request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'classroom.classCloneLesson',
				userId: uid,
				statementId: request.data?.sourceMainId,
				metadata: { newMainId: request.data?.newMainId },
			});
		}
	},
);
