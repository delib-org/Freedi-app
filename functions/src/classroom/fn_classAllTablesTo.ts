import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import {
	CLASS_TABLES_COLLECTION,
	TableStepSchema,
	functionConfig,
	proposalsTurnOf,
} from '@freedi/shared-types';
import type {
	ClassAllTablesToRequest,
	ClassAllTablesToResponse,
	ClassTable,
	TableStep,
} from '@freedi/shared-types';
import { number, record, safeParse, string } from 'valibot';
import { db } from '../db';
import { assertWorkspaceAdmin, requireId, requireUid } from './classroomAccess';
import { ClassroomError, toHttpsError } from './classroomErrors';
import { assertLessonRunning } from './lessonStatusGuard';

/**
 * `classAllTablesTo` (admin): put every table of the lesson on one step
 * ("כל השולחנות: מדרגים", or talk when the Proposals step opens). Only the
 * step moves; the turn, the asker and the question stay. The speaker is
 * always cleared (no stale countdown keeps showing), and a move to 'talk'
 * starts the speakers afresh: at the first turn of Proposals (`proposalsTurn =
 * 1`), or with `newTurn` at the next turn of every table (IA 25.6).
 */

const FromTurnsSchema = record(string(), number());

/**
 * The fields of a table that start speaking afresh at `talk`, or null when the
 * table is left alone: a new turn is given only to a table still at the turn
 * the console saw (`fromTurns`), so a repeated tap advances it once.
 */
function freshTalkPatch(
	table: ClassTable,
	newTurn: boolean,
	fromTurns: Record<string, number> | undefined,
): Record<string, unknown> | null {
	const seen = fromTurns?.[table.tableId];
	if (newTurn && seen !== undefined && seen !== proposalsTurnOf(table)) return null;

	return {
		spokenUids: [],
		passedSpeakingUids: FieldValue.delete(),
		proposalsTurn: newTurn ? proposalsTurnOf(table) + 1 : 1,
	};
}

export async function allTablesTo(
	firestore: Firestore,
	actorUid: string,
	req: ClassAllTablesToRequest,
): Promise<ClassAllTablesToResponse> {
	const mainId = requireId(req?.mainId, 'mainId');
	const parsed = safeParse(TableStepSchema, req?.step);
	if (!parsed.success)
		throw new ClassroomError('invalid-argument', 'step must be pick, talk, write or rate');
	const step: TableStep = parsed.output;
	const newTurn = req?.newTurn === true;
	if (newTurn && step !== 'talk') {
		throw new ClassroomError('invalid-argument', 'A new turn is a move to talk');
	}
	let fromTurns: Record<string, number> | undefined;
	if (req?.fromTurns !== undefined) {
		const turns = safeParse(FromTurnsSchema, req.fromTurns);
		if (!turns.success) {
			throw new ClassroomError('invalid-argument', 'fromTurns must map table ids to turns');
		}
		fromTurns = turns.output;
	}
	assertLessonRunning(await assertWorkspaceAdmin(firestore, mainId, actorUid));

	const snap = await firestore
		.collection(CLASS_TABLES_COLLECTION)
		.where('mainId', '==', mainId)
		.get();
	if (snap.empty) return { updated: 0 };
	const now = Date.now();
	const batch = firestore.batch();
	let updated = 0;
	snap.docs.forEach((d) => {
		const patch: Record<string, unknown> = {
			step,
			updatedAt: now,
			speakerUid: FieldValue.delete(),
			speakerEndsAt: FieldValue.delete(),
			speakerMs: FieldValue.delete(),
		};
		if (step === 'talk') {
			const fresh = freshTalkPatch(d.data() as ClassTable, newTurn, fromTurns);
			if (!fresh) return;
			Object.assign(patch, fresh);
		}
		updated += 1;
		batch.update(d.ref, patch);
	});
	// One batch: a lesson has ~10 tables, far below the 500-write limit.
	if (updated > 0) await batch.commit();

	return { updated };
}

export const classAllTablesTo = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<ClassAllTablesToRequest>): Promise<ClassAllTablesToResponse> => {
		let uid: string | undefined;
		try {
			uid = requireUid(request);

			return await allTablesTo(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'classroom.classAllTablesTo',
				userId: uid,
				statementId: request.data?.mainId,
				metadata: { step: request.data?.step, newTurn: request.data?.newTurn },
			});
		}
	},
);
