import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { Collections, StatementType, functionConfig } from '@freedi/shared-types';
import type {
	ClassResetVoteRequest,
	ClassResetVoteResponse,
	Statement,
	StatementSubscription,
} from '@freedi/shared-types';
import { db } from '../db';
import { assertWorkspaceAdmin, loadChallenge, requireId, requireUid } from './classroomAccess';
import { toHttpsError } from './classroomErrors';
import { assertLessonNotEnded } from './lessonStatusGuard';
import { commitInBatches } from './batchedWrites';
import type { BatchedWrite } from './batchedWrites';
import { assertVoteResettable, ballotAfterReset } from './resetVoteLogic';

/**
 * `classResetVote` (admin, IA 18.4): the class votes again on the same
 * proposals. Deleting a vote doc never subtracts from the tally (fn_vote skips
 * a deleted vote), so the tally is cleared here, last, once the votes are gone.
 *
 * Order: 1) votes, 2) isVoted on options, 3) decisionSupport on subscriptions,
 * 4) the challenge question (selections, topVotedOption, ballot close). A failed
 * run can be repeated: every step is a plain delete or clear.
 */

async function voteWrites(firestore: Firestore, challengeId: string): Promise<BatchedWrite[]> {
	const snap = await firestore
		.collection(Collections.votes)
		.where('parentId', '==', challengeId)
		.get();

	return snap.docs.map((d) => ({ kind: 'delete' as const, ref: d.ref }));
}

async function isVotedWrites(firestore: Firestore, challengeId: string): Promise<BatchedWrite[]> {
	const snap = await firestore
		.collection(Collections.statements)
		.where('parentId', '==', challengeId)
		.get();

	return snap.docs
		.filter((d) => {
			const s = d.data() as Statement;

			return s.statementType === StatementType.option && s.isVoted === true;
		})
		.map((d) => ({ kind: 'update' as const, ref: d.ref, data: { isVoted: false } }));
}

async function supportWrites(firestore: Firestore, mainId: string): Promise<BatchedWrite[]> {
	const snap = await firestore
		.collection(Collections.statementsSubscribe)
		.where('statementId', '==', mainId)
		.get();

	return snap.docs
		.filter((d) => typeof (d.data() as StatementSubscription).decisionSupport === 'number')
		.map((d) => ({
			kind: 'update' as const,
			ref: d.ref,
			data: { decisionSupport: FieldValue.delete() },
		}));
}

export async function resetVote(
	firestore: Firestore,
	actorUid: string,
	req: ClassResetVoteRequest,
): Promise<ClassResetVoteResponse> {
	const mainId = requireId(req?.mainId, 'mainId');
	const main = await assertWorkspaceAdmin(firestore, mainId, actorUid);
	assertLessonNotEnded(main);
	const challenge = await loadChallenge(firestore, mainId);
	const ballot = challenge.statementSettings?.ballot;
	assertVoteResettable(ballot, main);

	const votes = await voteWrites(firestore, challenge.statementId);
	await commitInBatches(firestore, votes);
	await commitInBatches(firestore, await isVotedWrites(firestore, challenge.statementId));
	await commitInBatches(firestore, await supportWrites(firestore, mainId));

	const now = Date.now();
	await firestore
		.collection(Collections.statements)
		.doc(challenge.statementId)
		.update({
			selections: FieldValue.delete(),
			topVotedOption: FieldValue.delete(),
			'statementSettings.ballot': ballotAfterReset(ballot),
			lastUpdate: now,
		});

	return { votesDeleted: votes.length };
}

export const classResetVote = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<ClassResetVoteRequest>): Promise<ClassResetVoteResponse> => {
		let uid: string | undefined;
		try {
			uid = requireUid(request);

			return await resetVote(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'classroom.classResetVote',
				userId: uid,
				statementId: request.data?.mainId,
			});
		}
	},
);
