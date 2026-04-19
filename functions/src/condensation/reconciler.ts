import { Statement } from '@freedi/shared-types';

/**
 * Jaccard-based idempotency reconciler.
 *
 * Given proposed groups (from the pipeline) and existing cluster statements
 * (from Firestore), decide for each proposed group whether to:
 *   - update an existing cluster in place (if Jaccard overlap ≥ threshold)
 *   - create a brand-new cluster
 *
 * Without this, every run of the pipeline would produce duplicate clusters.
 *
 * The matching is 1:1 greedy: the proposed group is matched to whichever
 * existing cluster has the highest overlap above the threshold; each
 * existing cluster can match at most one proposal per run.
 */

export interface ProposedGroup {
	sourceIds: string[];
	titleHint?: string;
	descriptionHint?: string;
}

export interface ReconciledGroup {
	kind: 'update' | 'create';
	sourceIds: string[];
	titleHint?: string;
	descriptionHint?: string;
	/** Set when kind === 'update' */
	existingClusterId?: string;
}

export interface ReconciledResult {
	groups: ReconciledGroup[];
	/** Existing clusters that had NO proposal match this run — candidates
	 *  for cleanup (stale integratedOptions). */
	orphanedClusterIds: string[];
}

function jaccard(a: string[], b: string[]): number {
	if (a.length === 0 && b.length === 0) return 0;
	const setA = new Set(a);
	const setB = new Set(b);
	let intersection = 0;
	setA.forEach((x) => {
		if (setB.has(x)) intersection++;
	});
	const union = setA.size + setB.size - intersection;
	if (union === 0) return 0;

	return intersection / union;
}

export function reconcileGroups(
	proposed: ProposedGroup[],
	existingClusters: Statement[],
	threshold: number,
): ReconciledResult {
	// Compute all pairwise Jaccard scores (proposal index × cluster id).
	const scores: Array<{ propIdx: number; clusterId: string; score: number }> = [];
	for (let i = 0; i < proposed.length; i++) {
		const proposal = proposed[i];
		for (const cluster of existingClusters) {
			const score = jaccard(proposal.sourceIds, cluster.integratedOptions ?? []);
			if (score >= threshold) {
				scores.push({ propIdx: i, clusterId: cluster.statementId, score });
			}
		}
	}

	// Greedy 1:1 assignment, highest score first.
	scores.sort((a, b) => b.score - a.score);
	const assignedProposal = new Set<number>();
	const assignedCluster = new Set<string>();
	const assignments = new Map<number, string>();
	for (const entry of scores) {
		if (assignedProposal.has(entry.propIdx)) continue;
		if (assignedCluster.has(entry.clusterId)) continue;
		assignedProposal.add(entry.propIdx);
		assignedCluster.add(entry.clusterId);
		assignments.set(entry.propIdx, entry.clusterId);
	}

	const groups: ReconciledGroup[] = proposed.map((p, idx) => {
		const existingClusterId = assignments.get(idx);

		return existingClusterId
			? {
				kind: 'update' as const,
				sourceIds: p.sourceIds,
				titleHint: p.titleHint,
				descriptionHint: p.descriptionHint,
				existingClusterId,
			}
			: {
				kind: 'create' as const,
				sourceIds: p.sourceIds,
				titleHint: p.titleHint,
				descriptionHint: p.descriptionHint,
			};
	});

	const orphanedClusterIds = existingClusters
		.map((c) => c.statementId)
		.filter((id) => !assignedCluster.has(id));

	return { groups, orphanedClusterIds };
}

/**
 * Stable hash of an integratedOptions set for cost gating. Identical sets
 * produce identical hashes regardless of order.
 */
export function hashIntegratedOptions(ids: string[]): string {
	const sorted = [...ids].sort();

	return sorted.join('|');
}
