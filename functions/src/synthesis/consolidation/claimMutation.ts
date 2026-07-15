import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, type Statement } from '@freedi/shared-types';
import {
	classifyClaimChange,
	revalidateMembers,
	type MemberBrief,
} from '../../services/claim-registry-service';
import { recordLiveSynthEvent } from '../liveSynth/auditLog';
import { enqueueItem } from '../queue/enqueue';

/**
 * Claim mutation protocol (docs/architecture/CLAIM_REGISTRY.md §3).
 *
 * Claims are versioned anchors. When a cluster's claim text changes (e.g.
 * synth title regeneration), one LLM call classifies HOW the meaning moved:
 *
 *   reword / broaden → members stay valid; version bump only.
 *   narrow / different → members re-validated in ONE batched call over their
 *     briefs; members that no longer express the claim are detached and
 *     auto-reprocessed through the pipeline (match another claim or spawn a
 *     provisional one). No admin queue on this path.
 *
 * Kept separate from consolidateClaims.ts so clusterRecompute (the title
 * regeneration site) can import it without an import cycle.
 */

function db() {
	return getFirestore();
}

export interface ClaimChangeInput {
	cluster: Statement;
	newClaim: string;
	newExplanation: string;
	triggerSource: string;
}

export interface ClaimChangeResult {
	change: 'reword' | 'broaden' | 'narrow' | 'different' | 'none';
	detachedIds: string[];
}

export async function applyClaimTextChange(input: ClaimChangeInput): Promise<ClaimChangeResult> {
	const { cluster, newClaim, newExplanation, triggerSource } = input;
	const raw = cluster as unknown as Record<string, unknown>;
	const oldClaim =
		typeof raw['canonicalClaim'] === 'string' ? (raw['canonicalClaim'] as string) : '';
	const oldVersion = typeof raw['claimVersion'] === 'number' ? (raw['claimVersion'] as number) : 1;
	if (!newClaim.trim() || newClaim.trim() === oldClaim.trim()) {
		return { change: 'none', detachedIds: [] };
	}

	const change = await classifyClaimChange(oldClaim, newClaim);
	const now = Date.now();
	const clusterRef = db().collection(Collections.statements).doc(cluster.statementId);

	const claimUpdate = {
		canonicalClaim: newClaim,
		publicExplanation: newExplanation,
		claimVersion: oldVersion + 1,
		claimUpdatedAt: now,
		lastUpdate: now,
	};

	if (change === 'reword' || change === 'broaden') {
		await clusterRef.update(claimUpdate);

		return { change, detachedIds: [] };
	}

	// narrow / different → batched member re-validation over briefs.
	const memberIds = cluster.integratedOptions ?? [];
	const memberSnaps =
		memberIds.length > 0
			? await db().getAll(...memberIds.map((id) => db().collection(Collections.statements).doc(id)))
			: [];
	const briefs: MemberBrief[] = memberSnaps
		.filter((s) => s.exists)
		.map((s) => {
			const data = s.data() as Statement & { embeddingBrief?: string };

			return {
				statementId: data.statementId,
				brief: data.embeddingBrief || data.statement || data.statementId,
			};
		});

	const revalidation = await revalidateMembers(newClaim, briefs);
	const detached = revalidation.detachedIds;

	await clusterRef.update({
		...claimUpdate,
		...(detached.length > 0
			? { integratedOptions: memberIds.filter((id) => !detached.includes(id)) }
			: {}),
	});

	if (detached.length > 0) {
		logger.info('claimRegistry.mutation.detached', {
			clusterId: cluster.statementId,
			change,
			detachedCount: detached.length,
			remaining: memberIds.length - detached.length,
		});

		await recordLiveSynthEvent({
			action: 'attach',
			clusterId: cluster.statementId,
			optionId: detached.join(','),
			reason: `claim ${change}ed; ${detached.length} member(s) no longer express it`,
			prevState: { integratedOptions: memberIds },
			newState: { integratedOptions: memberIds.filter((id) => !detached.includes(id)) },
			triggerSource,
			parentStatementId: cluster.parentId,
		});

		// Auto-reprocess: detached members re-enter the pipeline as new
		// arrivals — they'll match another claim or spawn a provisional one.
		for (const optionId of detached) {
			await enqueueItem({
				questionId: cluster.parentId,
				kind: 'process-option',
				optionId,
				forceProcess: false,
			});
		}
	}

	return { change, detachedIds: detached };
}
