import { createHash } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import type { Statement } from '@freedi/shared-types';

/**
 * Persisted per-parent state for the reJudge sweep.
 *
 * Backend-only: written and read exclusively by `fn_synthesisReJudge`. No
 * client ever touches it (see the deny rule in `firestore.rules`), so it is
 * deliberately NOT in the shared `Collections` enum — same convention as
 * `synthesisQueue` (`synthesis/queue/types.ts`).
 *
 * Why this exists
 * ---------------
 * The sweep is a repair pass on a corpus that is static almost all of the
 * time. It re-read that corpus every 10 minutes regardless: measured on
 * production (wizcol-app) it spent ~1,300 document reads per tick, 144 ticks a
 * day, reporting `totalMerges: 0` on every one — ~187k reads/day, 85% of the
 * project's entire Firestore read bill, against 21 writes/day.
 *
 * The information needed to skip that work was already being computed. The
 * revisit pass builds a `worldFp` fingerprint precisely so "a stable corpus is
 * not re-ground every 10 minutes" — but it is applied as a client-side filter
 * AFTER the documents have been fetched and billed. This module moves the same
 * idea in front of the reads.
 */
const SWEEP_STATE_COLLECTION = 'synthesisSweepState';

/** Reserved doc id for the cross-parent gate. Parent ids are statement ids. */
const GLOBAL_STATE_DOC = '__sweep';

/**
 * Bump when the fingerprint's inputs change, so deployed state from an older
 * shape can never read as "unchanged" and freeze the sweep.
 */
const FINGERPRINT_VERSION = 'v1';

/**
 * Longest a gate may suppress real work.
 *
 * Both gates infer "nothing changed" from timestamps maintained elsewhere
 * (`lastUpdate`, `lastChildUpdate`). If any write path ever fails to bump one,
 * the affected sweep would sleep forever rather than merely late. This floor
 * turns that class of bug into a bounded delay: the sweep runs in full at least
 * this often no matter what the fingerprints say.
 */
export const FORCE_FULL_SWEEP_MS = 6 * 60 * 60 * 1000;

/**
 * Cap on persisted pair refusals per parent.
 *
 * Refusals are pruned to the synths that still exist before saving, so this
 * only binds on a parent with a very large synth count (the pair space is
 * quadratic). Oldest entries drop first; a dropped refusal costs one re-judge,
 * not a wrong answer.
 */
const MAX_PERSISTED_REJECTIONS = 1_000;

export interface RejectedPairRecord {
	/** `pairKey(a, b)` — order-independent. */
	p: string;
	/** Membership fingerprint of both synths when the refusal was recorded. */
	f: string;
}

export interface ReJudgeSweepState {
	fingerprint: string;
	rejectedPairs: RejectedPairRecord[];
	lastSweptAt: number;
}

function db() {
	return getFirestore();
}

function shortHash(input: string): string {
	return createHash('sha1').update(input).digest('hex').slice(0, 12);
}

/**
 * Identity of one synth's membership. Any change of members — added, removed,
 * or swapped — changes this, which is what invalidates a stored refusal.
 * Length is kept outside the hash so the value stays readable in the console.
 */
export function memberStateKey(members: string[]): string {
	return `${members.length}:${shortHash([...members].sort().join(','))}`;
}

/**
 * Fingerprint of everything the sweep would act on for one parent.
 *
 * Inputs are free: the synth docs are already in hand from the sweep's own
 * top-level query, and the parent doc is read anyway for the judges' question
 * context. `lastChildUpdate` is the catch-all — it is bumped on the parent
 * whenever any child statement is created or updated
 * (`fn_statementCreation.ts:305`, `fn_statement_updates.ts:227`), so it covers
 * new options for the revisit pass and theme writes for the consolidate/split
 * passes, neither of which appear in the synth docs.
 */
export function computeParentFingerprint(
	synthDocs: Statement[],
	parentDoc: Statement | null,
): string {
	const synthPart = synthDocs
		.map((d) => `${d.statementId}:${(d.integratedOptions ?? []).length}:${d.lastUpdate ?? 0}`)
		.sort()
		.join(',');
	const parentPart = `${parentDoc?.lastChildUpdate ?? 0}:${parentDoc?.lastUpdate ?? 0}`;

	return `${FINGERPRINT_VERSION}:${shortHash(synthPart)}:${parentPart}`;
}

export async function loadSweepState(parentId: string): Promise<ReJudgeSweepState | null> {
	try {
		const snap = await db().collection(SWEEP_STATE_COLLECTION).doc(parentId).get();
		if (!snap.exists) return null;
		const data = snap.data() as Partial<ReJudgeSweepState> | undefined;
		if (!data?.fingerprint) return null;

		return {
			fingerprint: data.fingerprint,
			rejectedPairs: Array.isArray(data.rejectedPairs) ? data.rejectedPairs : [],
			lastSweptAt: data.lastSweptAt ?? 0,
		};
	} catch (error) {
		// Fail OPEN: a state read that fails must not skip the sweep. The cost of
		// being wrong here is one ordinary sweep, the cost of the opposite is
		// silently dropping the repair pass.
		logger.warn('synthesis.reJudge.state: load failed, sweeping anyway', {
			parentId,
			error: error instanceof Error ? error.message : String(error),
		});

		return null;
	}
}

export async function saveSweepState(
	parentId: string,
	fingerprint: string,
	rejectedPairs: RejectedPairRecord[],
	/** Same clock the gate compares against, so the staleness floor is coherent. */
	sweptAt: number,
): Promise<void> {
	try {
		await db()
			.collection(SWEEP_STATE_COLLECTION)
			.doc(parentId)
			.set({
				fingerprint,
				rejectedPairs: rejectedPairs.slice(-MAX_PERSISTED_REJECTIONS),
				lastSweptAt: sweptAt,
			});
	} catch (error) {
		logger.warn('synthesis.reJudge.state: save failed (non-fatal)', {
			parentId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export interface GlobalSweepState {
	/** Highest `statements.lastUpdate` this sweep has already accounted for. */
	lastSeenStatementUpdate: number;
	lastFullSweepAt: number;
}

export async function loadGlobalState(): Promise<GlobalSweepState> {
	try {
		const snap = await db().collection(SWEEP_STATE_COLLECTION).doc(GLOBAL_STATE_DOC).get();
		const data = snap.data() as Partial<GlobalSweepState> | undefined;

		return {
			lastSeenStatementUpdate: data?.lastSeenStatementUpdate ?? 0,
			lastFullSweepAt: data?.lastFullSweepAt ?? 0,
		};
	} catch (error) {
		logger.warn('synthesis.reJudge.state: global load failed, sweeping anyway', {
			error: error instanceof Error ? error.message : String(error),
		});

		return { lastSeenStatementUpdate: 0, lastFullSweepAt: 0 };
	}
}

export async function saveGlobalState(state: GlobalSweepState): Promise<void> {
	try {
		await db().collection(SWEEP_STATE_COLLECTION).doc(GLOBAL_STATE_DOC).set(state);
	} catch (error) {
		logger.warn('synthesis.reJudge.state: global save failed (non-fatal)', {
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/**
 * Decide, from persisted refusals, which pairs this sweep may skip.
 *
 * A refusal is honoured only while BOTH synths still have the exact membership
 * they had when the judge refused. A merge elsewhere in the parent grows a
 * recipient, which changes its key and puts every pair involving it back in
 * play — which is the behaviour the merge loop needs, since a grown synth is a
 * genuinely different question for the judge.
 */
export function resolveRejectedPairs(
	persisted: RejectedPairRecord[],
	currentPairState: Map<string, string>,
): Set<string> {
	const usable = new Set<string>();
	for (const record of persisted) {
		if (currentPairState.get(record.p) === record.f) usable.add(record.p);
	}

	return usable;
}
