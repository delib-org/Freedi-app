import { getFirestore, type DocumentReference } from 'firebase-admin/firestore';
import { Collections, type Statement } from '@freedi/shared-types';

/**
 * Atomic ownership for cluster spawns.
 *
 * `pairAlreadyClustered` checks ownership with a query, then the spawn spends
 * seconds on an LLM call before it writes. Two placements of the same pair that
 * overlap both pass the check and both write — measured on 2026-09-18, two queue
 * workers built the same two-member synth twice, 3 s apart.
 *
 * A claim is one small doc per (parent, mode, member) naming the cluster that
 * owns the member. The spawn reads the claims of both members and writes the
 * cluster together with its claims in ONE transaction, so of two overlapping
 * spawns exactly one commits; the other's transaction is retried, sees the
 * claim, and stands down.
 *
 * Claims are never cleaned up. A claim only blocks while its cluster still
 * exists, is visible and still lists the member — a dissolved, hidden or
 * shrunk cluster leaves a stale claim that the next spawn simply overwrites.
 */
export const SPAWN_CLAIMS_COLLECTION = '_synthSpawnClaims';

export type SpawnMode = 'synth' | 'cluster';

export interface SpawnClaim {
	parentId: string;
	mode: SpawnMode;
	memberId: string;
	clusterId: string;
	claimedAt: number;
}

export function spawnClaimId(parentId: string, mode: SpawnMode, memberId: string): string {
	return `${parentId}__${mode}__${memberId}`;
}

/**
 * Which claims block a spawn. A synth owner blocks both modes (the member is
 * already merged); a topic owner blocks only another topic cluster — a synth
 * may form from two ideas inside one theme, mirroring `pairAlreadyClustered`.
 */
export function blockingModes(mode: SpawnMode): SpawnMode[] {
	return mode === 'synth' ? ['synth'] : ['synth', 'cluster'];
}

/** Whether a claim still stands: its cluster exists, is visible and lists the member. */
export function isClaimLive(
	claim: Pick<SpawnClaim, 'memberId'> | undefined,
	cluster: Pick<Statement, 'hide' | 'integratedOptions'> | undefined,
): boolean {
	if (!claim || !cluster) return false;
	if (cluster.hide === true) return false;

	return (cluster.integratedOptions ?? []).includes(claim.memberId);
}

export interface CommitSpawnInput {
	parentId: string;
	mode: SpawnMode;
	memberIds: [string, string];
	clusterId: string;
	cluster: Record<string, unknown>;
}

export type CommitSpawnResult = { committed: true } | { committed: false; ownerId: string };

/**
 * Write `cluster` and claim both members for it — unless either member is
 * already claimed by a live cluster, in which case nothing is written.
 */
export async function commitSpawnWithClaims(input: CommitSpawnInput): Promise<CommitSpawnResult> {
	const db = getFirestore();
	const claimsCol = db.collection(SPAWN_CLAIMS_COLLECTION);
	const statementsCol = db.collection(Collections.statements);
	const checkRefs: DocumentReference[] = [];
	for (const memberId of input.memberIds) {
		for (const mode of blockingModes(input.mode)) {
			checkRefs.push(claimsCol.doc(spawnClaimId(input.parentId, mode, memberId)));
		}
	}

	return db.runTransaction(async (tx): Promise<CommitSpawnResult> => {
		const claimSnaps = await tx.getAll(...checkRefs);
		const claims = claimSnaps
			.filter((s) => s.exists)
			.map((s) => s.data() as SpawnClaim)
			.filter((c) => c.clusterId !== input.clusterId);
		if (claims.length > 0) {
			const clusterSnaps = await tx.getAll(...claims.map((c) => statementsCol.doc(c.clusterId)));
			for (let i = 0; i < claims.length; i++) {
				const cluster = clusterSnaps[i].exists ? (clusterSnaps[i].data() as Statement) : undefined;
				if (isClaimLive(claims[i], cluster))
					return { committed: false, ownerId: claims[i].clusterId };
			}
		}

		const now = Date.now();
		tx.set(statementsCol.doc(input.clusterId), input.cluster);
		for (const memberId of input.memberIds) {
			const claim: SpawnClaim = {
				parentId: input.parentId,
				mode: input.mode,
				memberId,
				clusterId: input.clusterId,
				claimedAt: now,
			};
			tx.set(claimsCol.doc(spawnClaimId(input.parentId, input.mode, memberId)), claim);
		}

		return { committed: true };
	});
}
