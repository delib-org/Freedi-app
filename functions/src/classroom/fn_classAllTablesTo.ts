import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { CLASS_TABLES_COLLECTION, TableStepSchema, functionConfig } from '@freedi/shared-types';
import type {
	ClassAllTablesToRequest,
	ClassAllTablesToResponse,
	TableStep,
} from '@freedi/shared-types';
import { safeParse } from 'valibot';
import { db } from '../db';
import { assertWorkspaceAdmin, requireId, requireUid } from './classroomAccess';
import { ClassroomError, toHttpsError } from './classroomErrors';

/**
 * `classAllTablesTo` (admin): put every table of the lesson on one step
 * ("כל השולחנות: מדרגים", or talk when the Proposals step opens). Only the
 * step moves; the turn, the asker and the question stay. The speaker is
 * always cleared (no stale countdown keeps showing), and a move to 'talk'
 * starts the round of speakers afresh.
 */

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
	await assertWorkspaceAdmin(firestore, mainId, actorUid);

	const snap = await firestore
		.collection(CLASS_TABLES_COLLECTION)
		.where('mainId', '==', mainId)
		.get();
	if (snap.empty) return { updated: 0 };
	const now = Date.now();
	const batch = firestore.batch();
	snap.docs.forEach((d) => {
		const patch: Record<string, unknown> = {
			step,
			updatedAt: now,
			speakerUid: FieldValue.delete(),
			speakerEndsAt: FieldValue.delete(),
		};
		if (step === 'talk') patch.spokenUids = [];
		batch.update(d.ref, patch);
	});
	// One batch: a lesson has ~10 tables, far below the 500-write limit.
	await batch.commit();

	return { updated: snap.size };
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
				metadata: { step: request.data?.step },
			});
		}
	},
);
