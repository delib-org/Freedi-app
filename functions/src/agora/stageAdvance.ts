/**
 * The one way a session moves between stages.
 *
 * Three callers share it — the teacher's advance callable, the evaluation
 * trigger's auto-open of voting, and the hourly sweep — and they used to
 * write `stage` three different ways. Now the POINTER moves in a transaction
 * guarded by the position the caller saw, and the side effects a stage
 * carries (close the question that just ended, draw the ballot, compute the
 * results) run after the commit, exactly once, by whichever caller won.
 *
 * Returns a typed result and never throws an HttpsError: the trigger calls
 * it too, and a lost race there is silence, not an error.
 */

import { FieldPath } from 'firebase-admin/firestore';
import { db } from '../db';
import {
	Collections,
	AgoraRoundPhase,
	AgoraSession,
	AgoraSessionStatus,
	AgoraStage,
	AgoraStagePlanItem,
	AgoraStageTriggerMode,
	AGORA_CYCLE,
	currentPlanIndex,
	planIndexForStage,
	resolveSessionFlow,
	resolveStagePlan,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { computeSessionResults } from './classScore';
import { prepareVotingStage } from './votingStage';
import { closeQuestionStage } from './questionStage';
import { computeAgreementResults } from './agreementResults';

export type AdvanceActor =
	| { kind: 'teacher'; uid: string }
	| { kind: 'system' }
	| { kind: 'sweep' };

export type AdvanceTarget = { toIndex: number } | { stage: AgoraStage };

export interface AdvanceOptions {
	/** Why voting opened, and who is on the ballot — set by the auto-open trigger */
	trigger?: { mode: AgoraStageTriggerMode; candidateIds: string[] };
}

export type AdvanceResult =
	| { ok: true; fromIndex: number; toIndex: number; stage: AgoraStage }
	| { ok: false; reason: 'not-found' | 'forbidden' | 'stale' | 'invalid-target' };

interface Committed {
	session: AgoraSession;
	plan: AgoraStagePlanItem[];
	fromIndex: number;
	toIndex: number;
}

export async function advanceSession(
	sessionId: string,
	target: AdvanceTarget,
	actor: AdvanceActor,
	options: AdvanceOptions = {},
): Promise<AdvanceResult> {
	const sessionRef = db.collection(Collections.agoraSessions).doc(sessionId);

	const committed = await db.runTransaction<Committed | AdvanceResult>(async (transaction) => {
		const snap = await transaction.get(sessionRef);
		if (!snap.exists) return { ok: false, reason: 'not-found' };
		const session = snap.data() as AgoraSession;
		if (actor.kind === 'teacher' && session.teacherId !== actor.uid) {
			return { ok: false, reason: 'forbidden' };
		}

		const plan = resolveStagePlan(session);
		const fromIndex = currentPlanIndex(session);
		const toIndex = 'toIndex' in target ? target.toIndex : planIndexForStage(session, target.stage);
		if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= plan.length) {
			return { ok: false, reason: 'invalid-target' };
		}
		// Forward only. The system actor is stricter still: it opens the very
		// next item and nothing else, so a trigger reading a stale stage can
		// never leap a room past a stage the teacher meant to run.
		if (toIndex <= fromIndex) return { ok: false, reason: 'stale' };
		if (actor.kind === 'system' && toIndex !== fromIndex + 1) {
			return { ok: false, reason: 'stale' };
		}

		const item = plan[toIndex];
		const now = Date.now();
		const status =
			item.stage === AgoraStage.ended ? AgoraSessionStatus.ended : AgoraSessionStatus.live;
		// Entering deliberation auto-starts round 1 — otherwise students wait on
		// "the teacher is opening the next round" while the teacher's CTA is
		// already pointing at the NEXT stage.
		const roundStart =
			item.stage === AgoraStage.deliberation && session.roundNumber === 0
				? {
						roundNumber: 1,
						roundPhase: AgoraRoundPhase.propose,
						roundEndsAt: now + AGORA_CYCLE.DELIBERATION_TOTAL_MS,
					}
				: {};

		transaction.update(sessionRef, {
			stage: item.stage,
			stageIndex: toIndex,
			status,
			...roundStart,
			lastUpdate: now,
		});
		// Runtime state is a MAP keyed by itemId, written by field path so an
		// itemId with a dot in it cannot be misread as nesting.
		transaction.update(sessionRef, new FieldPath('stageState', item.itemId, 'openedAt'), now);
		if (options.trigger) {
			transaction.update(
				sessionRef,
				new FieldPath('stageState', item.itemId, 'trigger'),
				options.trigger.mode,
			);
		}

		return { session, plan, fromIndex, toIndex };
	});

	if ('ok' in committed) return committed;

	const { session, plan, fromIndex, toIndex } = committed;
	const fromItem = plan[fromIndex];
	const toItem = plan[toIndex];

	// Side effects: after the commit, by whoever won it. Each is logged, none
	// can undo the move — the pointer already says the room is in the new
	// stage, and a screen that says "computing" beats one that lies.
	try {
		if (fromItem.stage === AgoraStage.question) {
			await closeQuestionStage(sessionId, fromItem);
		}

		if (toItem.stage === AgoraStage.voting) {
			await prepareVotingStage(sessionId, options.trigger?.candidateIds);
		}

		if (toItem.stage === AgoraStage.results || toItem.stage === AgoraStage.ended) {
			await computeResultsIfMissing(sessionId, session);
		}
	} catch (error) {
		logError(error, {
			operation: 'agora.advanceSession.sideEffects',
			metadata: { sessionId, from: fromItem.stage, to: toItem.stage, actor: actor.kind },
		});
	}

	return { ok: true, fromIndex, toIndex, stage: toItem.stage };
}

/**
 * Whatever the results screen waits on for this session's scoring mode. A
 * camp-less civic room's convergence cannot be computed yet — it needs the
 * closing re-rates — so its field is opened empty and filled as they arrive.
 */
async function computeResultsIfMissing(sessionId: string, session: AgoraSession): Promise<void> {
	const sessionRef = db.collection(Collections.agoraSessions).doc(sessionId);
	const { scoreMode } = resolveSessionFlow(session);

	if (scoreMode === 'convergence') {
		if (session.convergence) return;
		await sessionRef.update({
			convergence: {
				before: null,
				after: null,
				score: null,
				participants: 0,
				computedAt: Date.now(),
			},
		});

		return;
	}

	if (scoreMode === 'agreement') {
		if (session.agreement) return;
		await computeAgreementResults(sessionId);

		return;
	}

	if (session.classScore) return;
	await computeSessionResults(sessionId);
}
