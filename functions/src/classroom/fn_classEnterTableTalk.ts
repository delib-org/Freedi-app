import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { functionConfig } from '@freedi/shared-types';
import type { ClassEnterTableTalkRequest, ClassEnterTableTalkResponse } from '@freedi/shared-types';
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

/**
 * `classEnterTableTalk` (admin): the teacher's step change is a client write of
 * `lessonPlan.stepIndex`, so the server hears about it from this call, made
 * right after the move to Table talk. Every table doc then starts the step
 * clean: step 'talk', no pen (writerUid, writtenUids), no speaker, a fresh
 * `updatedAt`. Going back from Investigation (or later) otherwise left 'rate',
 * a stale pen and a running minute on the docs.
 *
 * Not `classAllTablesTo('talk')`: that one resets `proposalsTurn` and
 * `spokenUids`, which Table talk shares with Proposals, so they stay here.
 * Repeating the call is harmless: every field is set or cleared.
 */

/** The fields a table doc gets on entering Table talk. */
export function enterTableTalkPatch(now: number): Record<string, unknown> {
	return {
		step: 'talk',
		writerUid: FieldValue.delete(),
		writtenUids: FieldValue.delete(),
		speakerUid: FieldValue.delete(),
		speakerEndsAt: FieldValue.delete(),
		speakerMs: FieldValue.delete(),
		updatedAt: now,
	};
}

export async function enterTableTalk(
	firestore: Firestore,
	actorUid: string,
	req: ClassEnterTableTalkRequest,
): Promise<ClassEnterTableTalkResponse> {
	const mainId = requireId(req?.mainId, 'mainId');
	const main = await assertWorkspaceAdmin(firestore, mainId, actorUid);
	assertLessonNotEnded(main);
	if (lessonStepOf(main) !== 'tableTalk') {
		throw new ClassroomError(
			'failed-precondition',
			'The lesson is not at Table talk',
			'not-table-talk',
		);
	}
	const tables = await loadTables(firestore, mainId);
	const now = Date.now();
	await commitInBatches(
		firestore,
		tables.map((tb) => ({
			kind: 'update' as const,
			ref: tableRef(firestore, tb.tableId),
			data: enterTableTalkPatch(now),
		})),
	);

	return { reset: tables.length };
}

export const classEnterTableTalk = onCall(
	{ region: functionConfig.region },
	async (
		request: CallableRequest<ClassEnterTableTalkRequest>,
	): Promise<ClassEnterTableTalkResponse> => {
		let uid: string | undefined;
		try {
			uid = requireUid(request);

			return await enterTableTalk(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'classroom.classEnterTableTalk',
				userId: uid,
				statementId: request.data?.mainId,
			});
		}
	},
);
