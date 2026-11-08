import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { QUEUE_COLLECTION, type ProgressDoc } from '../queue/types';
import { isRunInFlight } from '../queue/runState';
import { LEASE_TTL_MS, PROPOSALS_SUBCOLLECTION, REBUILD_COLLECTION } from './constants';
import type { StoredProposal } from './types';

/**
 * Persistence of the rebuild: the per-question lease `_themeRebuild/{qid}` and
 * the previews under `_themeRebuild/{qid}/proposals/{runId}`.
 */

function db() {
	return getFirestore();
}

function leaseRef(questionId: string) {
	return db().collection(REBUILD_COLLECTION).doc(questionId);
}

function proposalRef(questionId: string, runId: string) {
	return leaseRef(questionId).collection(PROPOSALS_SUBCOLLECTION).doc(runId);
}

interface LeaseDoc {
	leaseUntil?: number;
	holder?: string;
}

/** A synthesis queue run rewrites clusters; a rebuild must not race it. */
export async function isSynthesisRunInFlight(questionId: string): Promise<boolean> {
	const snap = await db().collection(QUEUE_COLLECTION).doc(questionId).get();
	if (!snap.exists) return false;

	return isRunInFlight(snap.data() as ProgressDoc, Date.now());
}

/** True when the lease was taken; false when another rebuild holds it. */
export async function acquireLease(questionId: string, holder: string): Promise<boolean> {
	const ref = leaseRef(questionId);

	return db().runTransaction(async (tx) => {
		const snap = await tx.get(ref);
		const lease = snap.exists ? (snap.data() as LeaseDoc) : {};
		const now = Date.now();
		if ((lease.leaseUntil ?? 0) > now) return false;
		tx.set(ref, { leaseUntil: now + LEASE_TTL_MS, holder }, { merge: true });

		return true;
	});
}

/** Frees the lease only if this holder still owns it. Never throws. */
export async function releaseLease(questionId: string, holder: string): Promise<void> {
	const ref = leaseRef(questionId);
	try {
		await db().runTransaction(async (tx) => {
			const snap = await tx.get(ref);
			const lease = snap.exists ? (snap.data() as LeaseDoc) : {};
			if (lease.holder !== holder) return;
			tx.set(ref, { leaseUntil: 0 }, { merge: true });
		});
	} catch (error) {
		// The lease expires on its own after LEASE_TTL_MS.
		logger.warn('themeRebuild.releaseLease failed', {
			questionId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export async function saveProposal(proposal: StoredProposal): Promise<void> {
	await proposalRef(proposal.questionId, proposal.runId).set(proposal);
}

export async function loadProposal(
	questionId: string,
	runId: string,
): Promise<StoredProposal | null> {
	const snap = await proposalRef(questionId, runId).get();

	return snap.exists ? (snap.data() as StoredProposal) : null;
}

export async function markProposalApplied(questionId: string, runId: string): Promise<void> {
	await proposalRef(questionId, runId).set({ appliedAt: Date.now() }, { merge: true });
}
