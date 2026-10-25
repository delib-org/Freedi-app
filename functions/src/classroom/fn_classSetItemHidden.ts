import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { Collections, functionConfig } from '@freedi/shared-types';
import type {
	ClassSetItemHiddenRequest,
	ClassSetItemHiddenResponse,
	Statement,
} from '@freedi/shared-types';
import { db } from '../db';
import { assertWorkspaceAdmin, requireId, requireUid } from './classroomAccess';
import { ClassroomError, toHttpsError } from './classroomErrors';
import { assertLessonNotEnded } from './lessonStatusGuard';
import {
	WITHDRAWN_VOTE,
	ballotWithout,
	classifyHideable,
	isBallotCandidate,
} from './hideItemLogic';

/**
 * `classSetItemHidden` (admin, IA 18.4): the one "delete a result" of the
 * console, an undoable hide. One transaction. Hiding a candidate of an OPEN
 * ballot also takes it off the ballot and turns every vote on it into `none`
 * (fn_vote then moves the count). A closed ballot refuses; restoring never
 * puts the item back on the ballot.
 */

function statementRef(firestore: Firestore, id: string) {
	return firestore.collection(Collections.statements).doc(id);
}

export async function setItemHidden(
	firestore: Firestore,
	actorUid: string,
	req: ClassSetItemHiddenRequest,
): Promise<ClassSetItemHiddenResponse> {
	const mainId = requireId(req?.mainId, 'mainId');
	const statementId = requireId(req?.statementId, 'statementId');
	if (typeof req.hidden !== 'boolean') {
		throw new ClassroomError('invalid-argument', 'hidden must be true or false');
	}
	const hidden = req.hidden;
	assertLessonNotEnded(await assertWorkspaceAdmin(firestore, mainId, actorUid));

	return firestore.runTransaction(async (tx) => {
		const itemSnap = await tx.get(statementRef(firestore, statementId));
		if (!itemSnap.exists) throw new ClassroomError('not-found', 'Item not found');
		const item = itemSnap.data() as Statement;
		const parentSnap = await tx.get(statementRef(firestore, item.parentId));
		const parent = parentSnap.exists ? (parentSnap.data() as Statement) : undefined;
		classifyHideable(item, parent, mainId);

		const now = Date.now();
		const ballot = parent?.statementSettings?.ballot;
		if (!hidden || !ballot || !isBallotCandidate(ballot, statementId)) {
			tx.update(statementRef(firestore, statementId), { hide: hidden, lastUpdate: now });

			return { hidden, votesWithdrawn: 0 };
		}

		const next = ballotWithout(ballot, statementId);
		const voteSnap = await tx.get(
			firestore
				.collection(Collections.votes)
				.where('parentId', '==', item.parentId)
				.where('statementId', '==', statementId),
		);
		voteSnap.docs.forEach((v) => {
			tx.update(v.ref, { statementId: WITHDRAWN_VOTE, lastUpdate: now });
		});
		tx.update(statementRef(firestore, item.parentId), {
			'statementSettings.ballot': next,
			lastUpdate: now,
		});
		tx.update(statementRef(firestore, statementId), { hide: true, lastUpdate: now });

		return { hidden, votesWithdrawn: voteSnap.size };
	});
}

export const classSetItemHidden = onCall(
	{ region: functionConfig.region },
	async (
		request: CallableRequest<ClassSetItemHiddenRequest>,
	): Promise<ClassSetItemHiddenResponse> => {
		let uid: string | undefined;
		try {
			uid = requireUid(request);

			return await setItemHidden(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'classroom.classSetItemHidden',
				userId: uid,
				statementId: request.data?.mainId,
				metadata: { itemId: request.data?.statementId, hidden: request.data?.hidden },
			});
		}
	},
);
