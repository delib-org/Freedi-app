import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { functionConfig } from '@freedi/shared-types';
import type { ClassResetTurnsRequest, ClassResetTurnsResponse } from '@freedi/shared-types';
import { db } from '../db';
import {
	assertWorkspaceAdmin,
	loadTables,
	requireId,
	requireUid,
	tableRef,
} from './classroomAccess';
import { ClassroomError, toHttpsError } from './classroomErrors';
import { assertLessonNotEnded, lessonStepOf } from './lessonStatusGuard';
import { commitInBatches } from './batchedWrites';
import { selectTablesToReset, turnResetPatch } from './resetTurnsLogic';

/**
 * `classResetTurns` (admin, IA 18.4): at Table talk, give the turns back to one
 * table (`n`) or to every table. Everyone may ask again and every question is
 * free again; members, answers and ratings are kept. A running minute ends at
 * once (the speaker fields go with the turn).
 */

export async function resetTurns(
	firestore: Firestore,
	actorUid: string,
	req: ClassResetTurnsRequest,
): Promise<ClassResetTurnsResponse> {
	const mainId = requireId(req?.mainId, 'mainId');
	const main = await assertWorkspaceAdmin(firestore, mainId, actorUid);
	assertLessonNotEnded(main);
	if (lessonStepOf(main) !== 'tableTalk') {
		throw new ClassroomError(
			'failed-precondition',
			'Turns can be reset only at Table talk',
			'not-table-talk',
		);
	}
	const chosen = selectTablesToReset(await loadTables(firestore, mainId), req.n);
	const now = Date.now();
	await commitInBatches(
		firestore,
		chosen.map((tb) => ({
			kind: 'update' as const,
			ref: tableRef(firestore, tb.tableId),
			data: turnResetPatch(now),
		})),
	);

	return { reset: chosen.length };
}

export const classResetTurns = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<ClassResetTurnsRequest>): Promise<ClassResetTurnsResponse> => {
		let uid: string | undefined;
		try {
			uid = requireUid(request);

			return await resetTurns(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'classroom.classResetTurns',
				userId: uid,
				statementId: request.data?.mainId,
				metadata: { n: request.data?.n },
			});
		}
	},
);
