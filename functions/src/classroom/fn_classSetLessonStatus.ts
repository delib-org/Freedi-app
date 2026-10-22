import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import {
	CLASS_TABLES_COLLECTION,
	Collections,
	functionConfig,
	planLessonStatus,
} from '@freedi/shared-types';
import type {
	ClassSetLessonStatusRequest,
	ClassSetLessonStatusResponse,
	ClassTable,
	LessonStatusAction,
	Statement,
} from '@freedi/shared-types';
import { db } from '../db';
import { isWorkspaceAdmin, requireId, requireUid } from './classroomAccess';
import { ClassroomError, toHttpsError } from './classroomErrors';

/**
 * `classSetLessonStatus` (admin): pause / resume / end / keep open / reopen
 * (IA 13.6). One transaction moves the status on the main statement and, on
 * resume, shifts every table's `speakerEndsAt` by the pause length, so the
 * timers pick up where they stopped. The state machine itself is
 * `planLessonStatus` in shared-types (pure, shared with the client).
 */

const ACTIONS: ReadonlySet<string> = new Set<LessonStatusAction>([
	'pause',
	'resume',
	'end',
	'keepOpen',
	'reopen',
]);

function requireAction(value: unknown): LessonStatusAction {
	if (typeof value !== 'string' || !ACTIONS.has(value)) {
		throw new ClassroomError('invalid-argument', 'Unknown lesson status action');
	}

	return value as LessonStatusAction;
}

export async function setLessonStatus(
	firestore: Firestore,
	actorUid: string,
	req: ClassSetLessonStatusRequest,
	now: () => number = Date.now,
): Promise<ClassSetLessonStatusResponse> {
	const mainId = requireId(req?.mainId, 'mainId');
	const action = requireAction(req?.action);
	const mainRef = firestore.collection(Collections.statements).doc(mainId);
	const tablesQuery = firestore.collection(CLASS_TABLES_COLLECTION).where('mainId', '==', mainId);

	return firestore.runTransaction(async (tx) => {
		const mainSnap = await tx.get(mainRef);
		if (!mainSnap.exists) throw new ClassroomError('not-found', 'Lesson not found');
		const main = mainSnap.data() as Statement;
		if (!(await isWorkspaceAdmin(firestore, mainId, actorUid, main))) {
			throw new ClassroomError('permission-denied', "Only the lesson's teacher can do this");
		}
		const plan = main.statementSettings?.lessonPlan;
		if (!plan) throw new ClassroomError('failed-precondition', 'This is not a lesson');

		const at = now();
		let change;
		try {
			change = planLessonStatus(plan, action, at);
		} catch (error) {
			throw new ClassroomError(
				'failed-precondition',
				error instanceof Error ? error.message : 'That move is not allowed now',
			);
		}
		if (!change.changed) return { status: change.status, statusAt: plan.statusAt ?? at };

		// All reads before any write: the tables only matter when timers shift.
		const tables = change.shiftMs > 0 ? (await tx.get(tablesQuery)).docs : [];

		const patch: Record<string, unknown> = {
			'statementSettings.lessonPlan.status': change.status,
			'statementSettings.lessonPlan.statusAt': change.statusAt,
			lastUpdate: at,
		};
		if (change.pausedAt !== undefined)
			patch['statementSettings.lessonPlan.pausedAt'] = change.pausedAt;
		if (change.clearPausedAt) patch['statementSettings.lessonPlan.pausedAt'] = FieldValue.delete();
		if (change.endedAt !== undefined)
			patch['statementSettings.lessonPlan.endedAt'] = change.endedAt;
		tx.update(mainRef, patch);

		for (const doc of tables) {
			const table = doc.data() as ClassTable;
			if (typeof table.speakerEndsAt === 'number') {
				tx.update(doc.ref, { speakerEndsAt: table.speakerEndsAt + change.shiftMs, updatedAt: at });
			}
		}

		return { status: change.status, statusAt: change.statusAt };
	});
}

export const classSetLessonStatus = onCall(
	{ region: functionConfig.region },
	async (
		request: CallableRequest<ClassSetLessonStatusRequest>,
	): Promise<ClassSetLessonStatusResponse> => {
		let uid: string | undefined;
		try {
			uid = requireUid(request);

			return await setLessonStatus(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'classroom.classSetLessonStatus',
				userId: uid,
				statementId: request.data?.mainId,
				metadata: { action: request.data?.action },
			});
		}
	},
);
