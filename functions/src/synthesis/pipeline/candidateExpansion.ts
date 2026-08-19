import { logger } from 'firebase-functions';
import type { Statement } from '@freedi/shared-types';
import { embeddingCache } from '../../services/embedding-cache-service';

/**
 * Stage B candidate expansion.
 *
 * The Stage A vector search in `runSinglePipeline` returns top-N neighbors
 * (N=10) above `reviewLowerBound`. When a cluster has many members but only
 * a handful surface in that neighborhood, the existing transitive-evidence
 * promotion (at the call site, which only sees members already in
 * `candidates`) can fail to lift the cluster's bestSimilarity above the
 * attach threshold — even when other members of the SAME cluster sit at
 * very high cosine to the new option.
 *
 * Stage B closes that gap: for every cluster currently in the evidence map,
 * we batch-fetch the embeddings of ALL its members, compute cosine of each
 * against the new option, take the top-2 member cosines, and promote the
 * cluster's bestSimilarity to their AVERAGE if that exceeds the existing
 * value. The "average of top-2" rule is intentionally robust against a
 * single high-cosine outlier dragging a wide cluster over the attach gate
 * — it requires that at least two members agree the new option belongs.
 *
 * Cost: one batch read of N member docs per pipeline invocation (where N is
 * the union of member IDs across all clusters in the Stage A neighborhood).
 * Typically a few dozen reads. Cheap vs the alternative — a redundant
 * `generateSynthesizedProposal` call to spawn a duplicate synth (1-3s of
 * Gemini latency).
 *
 * Fail-open: if the batch read errors, the evidence map is returned
 * unchanged. The pipeline continues with Stage A signal only.
 */

export interface ClusterEvidenceLike {
	cluster: Statement;
	bestSimilarity: number;
	viaMember: boolean;
}

function cosine(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length === 0) return 0;
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}
	if (na === 0 || nb === 0) return 0;

	return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function expandClusterEvidenceViaFullMembers(
	evidence: Map<string, ClusterEvidenceLike>,
	newOptionEmbedding: number[],
): Promise<{
	map: Map<string, ClusterEvidenceLike>;
	promotions: number;
	/**
	 * The member embeddings fetched during expansion, keyed by member id. The
	 * cohesion gate reuses these so it never re-reads the same docs. Empty when
	 * the fetch was skipped or failed.
	 */
	memberEmbeddings: Map<string, number[]>;
	/**
	 * Per cluster, the top-2-average MEMBER cosine — evidence derived only from
	 * what the cluster actually contains, with the cluster's own title cosine
	 * excluded.
	 *
	 * `bestSimilarity` deliberately maxes the two so a drifting synth title can't
	 * hide a cluster from attach. But the same max lets the title carry an attach
	 * on its own, and an LLM-merged title abstracts: "Require Affordable
	 * Apartments in Every New Residential Development" sits close to every housing
	 * proposal in the question, not just to its own members. Measured, that is how
	 * both observed false merges happened — a 6-member housing synth swallowing
	 * three distinct ideas, and a 4-member synth merging compost collection with
	 * recycling pickup — in each case with cross-idea member cosines (≤0.836)
	 * safely BELOW attachThreshold.
	 *
	 * Kept separate so the attach gate can require member evidence while candidate
	 * discovery keeps using the max. Absent for a cluster whose members have no
	 * usable embeddings, where the caller falls back to `bestSimilarity`.
	 */
	memberEvidence: Map<string, number>;
}> {
	if (evidence.size === 0) {
		return {
			map: evidence,
			promotions: 0,
			memberEmbeddings: new Map(),
			memberEvidence: new Map(),
		};
	}

	// Union of all member IDs across clusters in the evidence map.
	const memberIds = new Set<string>();
	for (const entry of evidence.values()) {
		for (const m of entry.cluster.integratedOptions ?? []) memberIds.add(m);
	}
	if (memberIds.size === 0) {
		return { map: evidence, promotions: 0, memberEmbeddings: new Map(), memberEvidence: new Map() };
	}

	let memberEmbeddings: Map<string, number[]> | undefined;
	try {
		memberEmbeddings = await embeddingCache.getBatchEmbeddings(Array.from(memberIds));
	} catch (error) {
		logger.warn('candidateExpansion: member embedding fetch failed; falling back to Stage A only', {
			memberCount: memberIds.size,
			clusterCount: evidence.size,
			error: error instanceof Error ? error.message : String(error),
		});

		return { map: evidence, promotions: 0, memberEmbeddings: new Map(), memberEvidence: new Map() };
	}
	if (!memberEmbeddings || typeof memberEmbeddings.get !== 'function') {
		// Defensive: a stubbed cache (e.g. in tests) may resolve undefined.
		return { map: evidence, promotions: 0, memberEmbeddings: new Map(), memberEvidence: new Map() };
	}

	let promotions = 0;
	const memberEvidence = new Map<string, number>();
	for (const [clusterId, entry] of evidence) {
		const members = entry.cluster.integratedOptions ?? [];
		const cosines: number[] = [];
		for (const memberId of members) {
			const emb = memberEmbeddings.get(memberId);
			if (!emb || emb.length === 0) continue;
			cosines.push(cosine(emb, newOptionEmbedding));
		}
		// Need ≥2 member cosines for the "top-2 average" rule. Singletons fall
		// back to Stage A's direct cluster cosine.
		if (cosines.length < 2) continue;
		cosines.sort((a, b) => b - a);
		const top2Avg = (cosines[0] + cosines[1]) / 2;
		memberEvidence.set(clusterId, top2Avg);
		if (top2Avg > entry.bestSimilarity) {
			evidence.set(clusterId, {
				cluster: entry.cluster,
				bestSimilarity: top2Avg,
				viaMember: true,
			});
			promotions++;
		}
	}

	return { map: evidence, promotions, memberEmbeddings, memberEvidence };
}
