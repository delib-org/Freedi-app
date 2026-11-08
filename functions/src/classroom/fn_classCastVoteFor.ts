import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
	CLASS_TABLES_COLLECTION,
	Collections,
	NO_VOTE,
	functionConfig,
	getVoteId,
} from '@freedi/shared-types';
import type {
	ClassCastVoteForRequest,
	ClassCastVoteForResponse,
	ClassBallot,
	ClassTable,
	Statement,
	Vote,
} from '@freedi/shared-types';
import { db } from '../db';
import { assertWorkspaceAdmin, loadChallenge, requireId, requireUid } from './classroomAccess';
import { ClassroomError, toHttpsError } from './classroomErrors';
import { assertLessonRunning } from './lessonStatusGuard';
import { requireNoDeviceMember } from './noDeviceMembers';

/**
 * `classCastVoteFor` (the lesson's teacher only): the vote of a student without a
 * device. The votes rule lets a browser write only its own slot, so this is the one
 * path to `votes/{nd.id}--{challengeId}`. The vote counts like any other: the same
 * document, tallied by the same trigger. `enteredByUid` says who entered it; no
 * name goes on it.
 *
 * It repeats the rule's classBallotOpen check, because the Admin SDK skips the rules:
 * only while the ballot is frozen, not paused, not closed and the lesson not held,
 * and only for a candidate or 'none'. The ballot, the seat and the vote are read in
 * the transaction that writes, so a vote cannot slip in behind a close.
 */

/** The rule's classBallotOpen, plus a refusal when no ballot exists: this path is only ever a class vote. */
export function assertBallotTakesVote(ballot: ClassBallot | undefined, optionId: string): void {
	if (!ballot) {
		throw new ClassroomError('failed-precondition', 'The vote has not been opened', 'no-ballot');
	}
	if (typeof ballot.closedAt === 'number') {
		throw new ClassroomError('failed-precondition', 'The vote is already closed', 'vote-closed');
	}
	if (typeof ballot.pausedAt === 'number') {
		throw new ClassroomError('failed-precondition', 'The vote is paused', 'vote-paused');
	}
	if (optionId !== NO_VOTE && !ballot.candidateIds.includes(optionId)) {
		throw new ClassroomError(
			'failed-precondition',
			'This proposal is not on the ballot',
			'not-a-candidate',
		);
	}
}

export async function castVoteFor(
	firestore: Firestore,
	actorUid: string,
	req: ClassCastVoteForRequest,
): Promise<ClassCastVoteForResponse> {
	const mainId = requireId(req?.mainId, 'mainId');
	const forStudentId = requireId(req?.forStudentId, 'forStudentId');
	const optionId = requireId(req?.optionId, 'optionId');
	assertLessonRunning(await assertWorkspaceAdmin(firestore, mainId, actorUid));
	const { statementId: challengeId } = await loadChallenge(firestore, mainId);

	const challengeRef = firestore.collection(Collections.statements).doc(challengeId);
	const tablesQuery = firestore.collection(CLASS_TABLES_COLLECTION).where('mainId', '==', mainId);
	const voteId = getVoteId(forStudentId, challengeId);
	const voteRef = firestore.collection(Collections.votes).doc(voteId);

	await firestore.runTransaction(async (tx) => {
		const [challengeSnap, tablesSnap, voteSnap] = await Promise.all([
			tx.get(challengeRef),
			tx.get(tablesQuery),
			tx.get(voteRef),
		]);
		const { member } = requireNoDeviceMember(
			tablesSnap.docs.map((d) => d.data() as ClassTable),
			mainId,
			forStudentId,
		);
		assertBallotTakesVote(
			(challengeSnap.data() as Statement | undefined)?.statementSettings?.ballot,
			optionId,
		);
		const existing = voteSnap.exists ? (voteSnap.data() as Vote) : undefined;
		// The tally trigger treats a write of the same option as an error: a repeat stays a no-op.
		if (existing?.statementId === optionId) return;
		const now = Date.now();
		const vote: Vote = {
			voteId,
			statementId: optionId,
			parentId: challengeId,
			userId: member.id,
			enteredByUid: actorUid,
			lastUpdate: now,
			createdAt: existing?.createdAt ?? now,
		};
		tx.set(voteRef, vote);
	});

	return { ok: true, statementId: optionId };
}

export const classCastVoteFor = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<ClassCastVoteForRequest>): Promise<ClassCastVoteForResponse> => {
		let uid: string | undefined;
		try {
			uid = requireUid(request);

			return await castVoteFor(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'classroom.classCastVoteFor',
				userId: uid,
				statementId: request.data?.mainId,
				metadata: { forStudentId: request.data?.forStudentId, optionId: request.data?.optionId },
			});
		}
	},
);
