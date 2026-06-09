import { buildCandidateEdges } from '../services/similarity-grouping-service';
import { UnionFind } from '../utils/unionFind';

/**
 * Candidate-cluster generation for the bulk synthesis pipeline.
 *
 * Replaces the UMAP→DBSCAN candidate generator (`bulkClusterByEmbedding`) with
 * the SAME geometry the live single-option path uses: ANN cosine-threshold
 * edges (`buildCandidateEdges`) + connected components (`UnionFind`).
 *
 * Why: UMAP projects the 1536-d embeddings onto a connected low-D manifold, so
 * DBSCAN returns a few large blobs with ZERO singletons at every `eps` — it
 * cannot leave a genuinely-distinct idea alone. Real deliberation corpora are
 * the opposite shape: mostly distinct ideas with a few paraphrase clusters
 * (measured on a 252-option production question: at cosine ≥0.92 only ~22/252
 * options form 5 small clusters; ~230 are singletons). Cosine-threshold +
 * union-find preserves those singletons and forms only genuine near-duplicate
 * components; the downstream `twoTierJudge` then splits/drops any over-linked
 * component. See docs/clusters and synthesis/bulk-synthesis-production-architecture.md.
 */

export interface CandidateCluster {
	clusterId: string;
	memberIds: string[];
}

export interface CandidateClustersResult {
	/** Connected components of size ≥ 2 — the candidate clusters for the judge. */
	clusters: CandidateCluster[];
	/** Count of options that formed no edge (left standalone — the common case). */
	singletonCount: number;
	/** Number of undirected candidate edges found. */
	edgeCount: number;
}

/**
 * Default cosine threshold for forming synth candidates. Aligned with the live
 * path's "attach" gate (0.92): high enough that union-find components start
 * tight, leaving the judge to arbitrate the rest. Overridable per run for
 * parameter discipline (thresholds are corpus-dependent — never silently tuned).
 */
export const DEFAULT_SYNTH_CANDIDATE_THRESHOLD = 0.92;

/**
 * Resolve the candidate threshold from env (`SYNTHESIS_CANDIDATE_THRESHOLD`),
 * falling back to the default. Returned so callers can record the value used.
 */
export function resolveCandidateThreshold(): number {
	const raw = Number(process.env.SYNTHESIS_CANDIDATE_THRESHOLD);

	return Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : DEFAULT_SYNTH_CANDIDATE_THRESHOLD;
}

/**
 * Build candidate clusters from a set of option ids by ANN cosine edges +
 * connected components. Only edges whose BOTH endpoints are in `candidateIds`
 * are unioned (the vector index is scoped to the parent and may return options
 * outside the working set — e.g. filtered-out or hidden ones).
 */
export async function buildCandidateClusters(
	candidateIds: string[],
	options: { parentId: string; threshold?: number; k?: number },
): Promise<CandidateClustersResult> {
	if (candidateIds.length < 2) {
		return { clusters: [], singletonCount: candidateIds.length, edgeCount: 0 };
	}

	const threshold = options.threshold ?? resolveCandidateThreshold();
	const inSet = new Set(candidateIds);
	const edges = await buildCandidateEdges(candidateIds, {
		parentId: options.parentId,
		threshold,
		k: options.k,
	});

	const uf = new UnionFind();
	for (const id of candidateIds) uf.add(id);
	let unionedEdges = 0;
	for (const edge of edges) {
		if (!inSet.has(edge.a) || !inSet.has(edge.b)) continue;
		uf.union(edge.a, edge.b);
		unionedEdges++;
	}

	const components = uf.components();
	const clusters: CandidateCluster[] = components
		.filter((c) => c.length >= 2)
		.map((memberIds, i) => ({ clusterId: `cluster-${i}`, memberIds }));
	const singletonCount = components.filter((c) => c.length === 1).length;

	return { clusters, singletonCount, edgeCount: unionedEdges };
}
