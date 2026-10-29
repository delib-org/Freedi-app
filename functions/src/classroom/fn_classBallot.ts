import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { Collections, StatementType, functionConfig } from '@freedi/shared-types';
import type {
	ClassBallot,
	ClassCloseBallotRequest,
	ClassCloseBallotResponse,
	ClassFreezeBallotRequest,
	ClassFreezeBallotResponse,
	ClassPauseBallotRequest,
	ClassPauseBallotResponse,
	Statement,
} from '@freedi/shared-types';
import { db } from '../db';
import { assertWorkspaceAdmin, loadChallenge, requireId, requireUid } from './classroomAccess';
import { ClassroomError, toHttpsError } from './classroomErrors';
import {
	DEFAULT_BALLOT_TOP_N,
	decideFromTally,
	decidePause,
	resolveGate,
	selectBallotCandidates,
	tallyCandidates,
	wantsAllProposals,
} from './ballotLogic';

/**
 * The class ballot on the challenge question (statementSettings.ballot).
 *
 * `classFreezeBallot` (admin): candidates = proposals at/above the gate, or
 * the top N by consensus when fewer than two pass; re-freezing is allowed
 * until the ballot is closed. Students vote with plain `votes` docs; the
 * existing fn_vote trigger tallies them into the question's `selections{}`.
 *
 * `classCloseBallot` (admin): tallies `selections{}` over the candidates and
 * records the decision (votes, then consensus, then id — decideBallot).
 * Closing twice returns the first result unchanged.
 *
 * `classPauseBallot` (admin): pauses (ballot.pausedAt; the votes rule refuses
 * every vote while it is set, the cast votes are kept) or resumes the vote.
 * Not reversible closing: a closed ballot is neither paused nor resumed.
 */

async function loadOptions(firestore: Firestore, challengeId: string): Promise<Statement[]> {
	const snap = await firestore
		.collection(Collections.statements)
		.where('parentId', '==', challengeId)
		.get();

	return snap.docs
		.map((d) => d.data() as Statement)
		.filter((s) => s.statementType === StatementType.option);
}

export async function freezeBallot(
	firestore: Firestore,
	actorUid: string,
	req: ClassFreezeBallotRequest,
): Promise<ClassFreezeBallotResponse> {
	const mainId = requireId(req?.mainId, 'mainId');
	const topN = req?.topN;
	if (topN !== undefined && (typeof topN !== 'number' || !Number.isFinite(topN) || topN < 1)) {
		throw new ClassroomError('invalid-argument', 'topN must be a positive number');
	}
	// The permission check (main + subscription reads) and the challenge lookup (a query over the
	// lesson's questions) do not depend on each other: run them side by side so the teacher's
	// press pays for the slower one, not both. Nothing is written before both have passed, and a
	// refused caller still gets permission-denied first.
	const adminCheck = assertWorkspaceAdmin(firestore, mainId, actorUid);
	const challengeLookup = loadChallenge(firestore, mainId);
	challengeLookup.catch(() => undefined); // surfaced below, after the admin check
	const main = await adminCheck;
	const challenge = await challengeLookup;
	if (challenge.statementSettings?.ballot?.closedAt) {
		throw new ClassroomError('failed-precondition', 'The vote is already closed');
	}

	const options = await loadOptions(firestore, challenge.statementId);
	const candidateIds = selectBallotCandidates(
		options.map((o) => ({ statementId: o.statementId, consensus: o.consensus, hide: o.hide })),
		resolveGate(challenge, main),
		topN ?? DEFAULT_BALLOT_TOP_N,
		wantsAllProposals(challenge),
	);
	if (candidateIds.length === 0) {
		throw new ClassroomError('failed-precondition', 'There are no proposals to vote on');
	}

	const ref = firestore.collection(Collections.statements).doc(challenge.statementId);

	return firestore.runTransaction(async (tx) => {
		// Re-read the ballot inside the transaction: a close or a pause that
		// lands between the shortlist read and this write is not lost.
		const current = ((await tx.get(ref)).data() as Statement | undefined)?.statementSettings
			?.ballot;
		if (typeof current?.closedAt === 'number') {
			throw new ClassroomError('failed-precondition', 'The vote is already closed');
		}
		const frozenAt = Date.now();
		// A re-freeze while the vote is paused keeps it paused.
		const pausedAt = current?.pausedAt;
		const ballot: ClassBallot = {
			candidateIds,
			frozenAt,
			...(typeof pausedAt === 'number' ? { pausedAt } : {}),
		};
		tx.update(ref, { 'statementSettings.ballot': ballot, lastUpdate: frozenAt });

		return { candidateIds, frozenAt };
	});
}

export async function closeBallot(
	firestore: Firestore,
	actorUid: string,
	req: ClassCloseBallotRequest,
): Promise<ClassCloseBallotResponse> {
	const mainId = requireId(req?.mainId, 'mainId');
	await assertWorkspaceAdmin(firestore, mainId, actorUid);
	const { statementId: challengeId } = await loadChallenge(firestore, mainId);
	const ref = firestore.collection(Collections.statements).doc(challengeId);

	return firestore.runTransaction(async (tx) => {
		const snap = await tx.get(ref);
		const challenge = snap.data() as Statement;
		const ballot = challenge.statementSettings?.ballot;
		if (!ballot) throw new ClassroomError('failed-precondition', 'The vote has not been opened');
		if (typeof ballot.closedAt === 'number') {
			return { decisionId: ballot.decisionId ?? null, closedAt: ballot.closedAt };
		}

		const optionRefs = ballot.candidateIds.map((id) =>
			firestore.collection(Collections.statements).doc(id),
		);
		const optionSnaps = optionRefs.length > 0 ? await tx.getAll(...optionRefs) : [];
		const consensus: Record<string, number> = {};
		optionSnaps.forEach((s) => {
			if (s.exists) consensus[s.id] = (s.data() as Statement).consensus ?? 0;
		});
		const existing = ballot.candidateIds.filter((id) => id in consensus);
		const tally = tallyCandidates(
			existing,
			challenge.selections as Record<string, number> | undefined,
		);
		const decisionId = decideFromTally(tally, consensus);

		const closedAt = Date.now();
		const closed: ClassBallot = { ...ballot, closedAt, ...(decisionId ? { decisionId } : {}) };
		tx.update(ref, { 'statementSettings.ballot': closed, lastUpdate: closedAt });

		return { decisionId, closedAt };
	});
}

const PAUSE_REFUSAL_MESSAGE = {
	'not-open': 'The vote has not been opened',
	closed: 'The vote is already closed',
} as const;

export async function pauseBallot(
	firestore: Firestore,
	actorUid: string,
	req: ClassPauseBallotRequest,
): Promise<ClassPauseBallotResponse> {
	const mainId = requireId(req?.mainId, 'mainId');
	if (typeof req?.paused !== 'boolean') {
		throw new ClassroomError('invalid-argument', 'paused must be a boolean');
	}
	const paused = req.paused;
	await assertWorkspaceAdmin(firestore, mainId, actorUid);
	const { statementId: challengeId } = await loadChallenge(firestore, mainId);
	const ref = firestore.collection(Collections.statements).doc(challengeId);

	return firestore.runTransaction(async (tx) => {
		const snap = await tx.get(ref);
		const challenge = snap.data() as Statement;
		const now = Date.now();
		const decision = decidePause(challenge.statementSettings?.ballot, paused, now);
		if (decision.kind === 'refuse') {
			throw new ClassroomError('failed-precondition', PAUSE_REFUSAL_MESSAGE[decision.reason]);
		}
		if (decision.kind === 'write') {
			tx.update(ref, { 'statementSettings.ballot': decision.ballot, lastUpdate: now });
		}

		return { pausedAt: decision.pausedAt };
	});
}

export const classFreezeBallot = onCall(
	{ region: functionConfig.region },
	async (
		request: CallableRequest<ClassFreezeBallotRequest>,
	): Promise<ClassFreezeBallotResponse> => {
		let uid: string | undefined;
		try {
			uid = requireUid(request);

			return await freezeBallot(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'classroom.classFreezeBallot',
				userId: uid,
				statementId: request.data?.mainId,
				metadata: { topN: request.data?.topN },
			});
		}
	},
);

export const classCloseBallot = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<ClassCloseBallotRequest>): Promise<ClassCloseBallotResponse> => {
		let uid: string | undefined;
		try {
			uid = requireUid(request);

			return await closeBallot(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'classroom.classCloseBallot',
				userId: uid,
				statementId: request.data?.mainId,
			});
		}
	},
);

export const classPauseBallot = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<ClassPauseBallotRequest>): Promise<ClassPauseBallotResponse> => {
		let uid: string | undefined;
		try {
			uid = requireUid(request);

			return await pauseBallot(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'classroom.classPauseBallot',
				userId: uid,
				statementId: request.data?.mainId,
				metadata: { paused: request.data?.paused },
			});
		}
	},
);
