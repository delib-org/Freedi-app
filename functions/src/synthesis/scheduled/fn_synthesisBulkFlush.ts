import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, functionConfig, type Statement } from '@freedi/shared-types';
import { bulkClusterByEmbedding, type ClusterableInput } from '../bulkCluster';
import { embeddingCache } from '../../services/embedding-cache-service';
import { attachOptionToCluster, isCluster } from '../pipeline/clusterOps';

/**
 * Scheduled bulk-flush sweep.
 *
 * The live-synth pipeline handles attaches and the first few spawns
 * reactively, but at burst arrival rates it leaves residual fragmentation —
 * same-theme paraphrases that arrived while a spawn-debounce was active and
 * ended up as singletons or duplicate 2-member synths. This sweep re-truths
 * cluster structure with the in-memory UMAP+DBSCAN path (the same primitive
 * the admin `synthesizeIdeasPreview` callable uses) on a 2-minute cadence,
 * scoped to parents that have had recent spawn activity.
 *
 * Design constraints (per the hybrid design):
 *   - Live pipeline keeps owning the latency-sensitive attach hot path.
 *   - This sweep runs OFF the request path; users see attaches happen at
 *     live latency, structural cleanup happens within 2 min.
 *   - Bounded work: at most BULK_LIMIT parents per tick (50). Excess waits.
 *   - Quiet-period gate: skip parents with activity in the last 30s so we
 *     don't fight a burst that's still in progress.
 *   - First pass is attach-only: for each detected dense cluster from
 *     UMAP+DBSCAN, find the existing synth that shares the most members
 *     with the dense cluster and attach the orphan members. Spawn-from-bulk
 *     and synth-to-synth merging are intentionally deferred to a later
 *     iteration (the reJudge sweep) — attach alone closes the dominant
 *     fragmentation case where live-synth produced 2-member synths.
 */

const QUIET_PERIOD_MS = 30_000;
const BULK_LIMIT = 50;
const MAX_OPTIONS_PER_PARENT = 5_000;
const MIN_OPTIONS_FOR_BULK = 4;

interface BulkRequestDoc {
	parentId: string;
	lastSpawnAt?: number;
	lastSpawnClusterId?: string;
}

function db() {
	return getFirestore();
}

async function processParent(parentId: string): Promise<{
	optionsConsidered: number;
	denseClusters: number;
	attaches: number;
}> {
	// Fetch all option statements parented to this question.
	const snap = await db()
		.collection(Collections.statements)
		.where('parentId', '==', parentId)
		.where('statementType', '==', 'option')
		.limit(MAX_OPTIONS_PER_PARENT)
		.get();

	const allDocs: Statement[] = snap.docs.map((d) => d.data() as Statement);

	// Plain options (the ones we want to potentially attach).
	const plainOptions = allDocs.filter((s) => !isCluster(s) && !s.hide);
	// Existing clusters (synths and topic-clusters) — used as attach targets.
	const existingClusters = allDocs.filter((s) => isCluster(s) && !s.hide);

	if (plainOptions.length < MIN_OPTIONS_FOR_BULK) {
		return { optionsConsidered: plainOptions.length, denseClusters: 0, attaches: 0 };
	}

	// Batch-fetch embeddings for plain options.
	const optionIds = plainOptions.map((o) => o.statementId);
	const embeddingMap = await embeddingCache.getBatchEmbeddings(optionIds);
	if (!embeddingMap || typeof embeddingMap.get !== 'function') {
		return { optionsConsidered: plainOptions.length, denseClusters: 0, attaches: 0 };
	}

	const clusterables: ClusterableInput[] = [];
	for (const opt of plainOptions) {
		const emb = embeddingMap.get(opt.statementId);
		if (emb && emb.length > 0) clusterables.push({ id: opt.statementId, embedding: emb });
	}

	if (clusterables.length < MIN_OPTIONS_FOR_BULK) {
		return { optionsConsidered: plainOptions.length, denseClusters: 0, attaches: 0 };
	}

	// Map clusterId → existing cluster (for attach lookups) and a reverse
	// index of memberId → containing existing cluster.
	const clusterById = new Map<string, Statement>();
	const memberToCluster = new Map<string, Statement>();
	for (const c of existingClusters) {
		clusterById.set(c.statementId, c);
		for (const memberId of c.integratedOptions ?? []) {
			memberToCluster.set(memberId, c);
		}
	}

	const bulk = bulkClusterByEmbedding(clusterables);
	let attaches = 0;

	for (const dense of bulk.clusters) {
		if (dense.memberIds.length < 2) continue;

		// Find the existing cluster with the largest overlap with this dense
		// detection. Tally members in the dense cluster that already belong
		// to each existing cluster.
		const overlapByCluster = new Map<string, number>();
		for (const memberId of dense.memberIds) {
			const existing = memberToCluster.get(memberId);
			if (existing) {
				overlapByCluster.set(
					existing.statementId,
					(overlapByCluster.get(existing.statementId) ?? 0) + 1,
				);
			}
		}
		if (overlapByCluster.size === 0) continue;

		// Pick the existing cluster with the most overlap. Tie → skip (don't
		// guess; the reJudge sweep will handle synth-to-synth merging).
		const sorted = Array.from(overlapByCluster.entries()).sort((a, b) => b[1] - a[1]);
		if (sorted.length >= 2 && sorted[0][1] === sorted[1][1]) continue;
		const targetClusterId = sorted[0][0];
		const targetCluster = clusterById.get(targetClusterId);
		if (!targetCluster) continue;

		// Attach orphan members (those in the dense cluster but NOT yet in
		// the target cluster) to the target.
		const targetMembers = new Set(targetCluster.integratedOptions ?? []);
		for (const memberId of dense.memberIds) {
			if (targetMembers.has(memberId)) continue;
			const orphanOption = plainOptions.find((o) => o.statementId === memberId);
			if (!orphanOption) continue;
			// Skip orphans that are already in a DIFFERENT existing cluster —
			// moving them requires a merge, not a simple attach. Leave for
			// the reJudge sweep.
			const owner = memberToCluster.get(memberId);
			if (owner && owner.statementId !== targetClusterId) continue;

			const result = await attachOptionToCluster({
				cluster: targetCluster,
				option: orphanOption,
				similarity: 0, // bulk-driven; not a per-pair cosine
				triggerSource: 'bulkFlush',
			});
			if (result.attached) {
				targetMembers.add(memberId);
				memberToCluster.set(memberId, targetCluster);
				attaches++;
			}
		}
	}

	return {
		optionsConsidered: plainOptions.length,
		denseClusters: bulk.clusters.length,
		attaches,
	};
}

export const fn_synthesisBulkFlush = onSchedule(
	{
		schedule: 'every 2 minutes',
		timeZone: 'UTC',
		...functionConfig,
		timeoutSeconds: 300,
		memory: '1GiB',
	},
	async () => {
		const startedAt = Date.now();
		try {
			const requests = await db()
				.collection('_synthBulkRequests')
				.limit(BULK_LIMIT)
				.get();
			if (requests.empty) return;

			let processed = 0;
			let totalAttaches = 0;
			let totalDense = 0;
			for (const reqDoc of requests.docs) {
				const data = reqDoc.data() as BulkRequestDoc;
				if (data.lastSpawnAt && Date.now() - data.lastSpawnAt < QUIET_PERIOD_MS) {
					// Still in burst; come back next tick.
					continue;
				}
				const parentId = data.parentId ?? reqDoc.id;
				try {
					const result = await processParent(parentId);
					totalAttaches += result.attaches;
					totalDense += result.denseClusters;
					processed++;
					logger.info('synthesis.bulkFlush.parent', {
						parentId,
						optionsConsidered: result.optionsConsidered,
						denseClusters: result.denseClusters,
						attaches: result.attaches,
					});
				} catch (error) {
					logger.warn('synthesis.bulkFlush: parent processing failed', {
						parentId,
						error: error instanceof Error ? error.message : String(error),
					});
				}
				// Clear the marker regardless of success — a retry would just
				// re-discover the same state. If new spawns happen, they'll
				// re-mark this parent.
				try {
					await reqDoc.ref.delete();
				} catch {
					// non-fatal
				}
			}

			logger.info('synthesis.bulkFlush.summary', {
				processed,
				totalAttaches,
				totalDense,
				durationMs: Date.now() - startedAt,
			});
		} catch (error) {
			logger.error('synthesis.bulkFlush: sweep failed', {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	},
);
