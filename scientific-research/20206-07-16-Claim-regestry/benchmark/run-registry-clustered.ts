/**
 * Condition CHC — Phase 2 two-hop classification, but with the topic layer
 * built by SIMILARITY-THRESHOLD CLUSTERING instead of asking an LLM to freely
 * invent 3-8 themes from the claim list.
 *
 * Why: Condition CH (run-registry-hierarchical.ts) showed the free-form
 * topic-invention approach reliably produces one oversized "catch-all" topic
 * per dataset (33-76% of all claims in every dataset tested) plus several
 * small ones. Routing into that mega-topic is *correct* but barely narrows
 * anything, which is most of why mean candidate-list-size stalled at ~53%
 * (gate: <40%) despite the underlying classification accuracy being fine.
 *
 * This harness clusters claims by average-linkage agglomerative clustering
 * over cosine similarity, merging two clusters only while their average
 * cross-cluster similarity stays above --sim-threshold. That lets a
 * genuinely homogeneous group of near-duplicate claims stay together
 * (forcing it apart would be wrong, not just uneven), while claims that
 * aren't actually alike don't get lumped into one topic just because an LLM
 * free-associated a shared theme. Cluster membership - not a separate LLM
 * routing call - IS the per-claim topic assignment, so this also skips the
 * ~1-call-per-claim topic-assignment cost Condition CH paid.
 *
 * Only the topic-CONSTRUCTION step changes. Per-statement classification
 * still calls the production classifyHierarchical/routeToTopics unmodified.
 *
 * Usage (from scientific-research/20206-07-16-Claim-regestry/benchmark/):
 *   LLM_CONCURRENCY=3 npx tsx run-registry-clustered.ts --dataset polis_canadian_electoral_reform [--sim-threshold 0.55] [--min-cluster-size 3]
 */
import { loadEnv } from './lib/env';

loadEnv();

import {
	classifyHierarchical,
	type ClusterClaim,
	type HierarchicalClassification,
} from '../../../functions/src/services/claim-registry-service';
import { callLLM, extractJson, WORKER_MODEL } from '../../../functions/src/config/openai-chat';
import { loadTriplets, questionFor } from './lib/datasets';
import { appendJsonl, doneIds, readJsonl, resultsPath } from './lib/io';
import { clusterBySimilarity, cosine, similarityMatrix } from './lib/clustering';
import { cachedEmbedBatch } from './lib/embeddings';

const RESULT_FILE = 'registry-clustered-CHC.jsonl';
const CLAIM_CACHE_FILE = 'generated-claims.jsonl';

interface GeneratedClaimRow {
	id: string;
	canonicalClaim: string;
	publicExplanation: string;
}

export interface ClusteredRow {
	id: string;
	dataset: string;
	condition: 'CHC';
	codebookSize: number;
	topicCount: number;
	candidateCountMatch: number;
	candidateCountDistractor: number;
	match: HierarchicalClassification;
	distractor: HierarchicalClassification;
}

const CLUSTER_TOPIC_SYSTEM = `You are given a group of claims from a public deliberation question. A similarity-based clustering step (not you) has already decided these claims express closely related ideas. Write ONE topic label for the whole group: a 5-15 word neutral title and a one-sentence explanation. The topic is a broad theme (a drawer), NOT a specific proposal — nobody can "agree" with a topic.

Respond with JSON only: {"title": "...", "explanation": "..."}`;

function readCache(): Map<string, GeneratedClaimRow> {
	const cache = new Map<string, GeneratedClaimRow>();
	for (const row of readJsonl<GeneratedClaimRow>(CLAIM_CACHE_FILE)) cache.set(row.id, row);

	return cache;
}

const EMBEDDING_CACHE_FILE = 'claim-embeddings-cache.jsonl';

function parseArgs(): {
	dataset: string;
	simThreshold: number;
	minClusterSize: number;
	limit?: number;
	clusterOnly: boolean;
} {
	const args = process.argv.slice(2);
	const get = (flag: string): string | undefined => {
		const i = args.indexOf(flag);

		return i >= 0 ? args[i + 1] : undefined;
	};

	return {
		dataset: get('--dataset') ?? 'polis_canadian_electoral_reform',
		simThreshold: get('--sim-threshold') ? Number(get('--sim-threshold')) : 0.55,
		minClusterSize: get('--min-cluster-size') ? Number(get('--min-cluster-size')) : 3,
		limit: get('--limit') ? Number(get('--limit')) : undefined,
		clusterOnly: args.includes('--cluster-only'),
	};
}

async function main(): Promise<void> {
	const { dataset, simThreshold, minClusterSize, limit, clusterOnly } = parseArgs();
	const questionText = questionFor(dataset);

	let triplets = loadTriplets('main').filter((t) => t.dataset === dataset);
	if (limit) triplets = triplets.slice(0, limit);
	if (triplets.length === 0) throw new Error(`No triplets found for dataset "${dataset}"`);

	const claimCache = readCache();
	const missing = triplets.filter((t) => !claimCache.has(t.id));
	if (missing.length > 0) {
		throw new Error(`generated-claims.jsonl missing ${missing.length} claims for ${dataset}`);
	}

	console.info(`[${dataset}] embedding ${triplets.length} claims for clustering...`);
	const ctx = (text: string): string => `Question: ${questionText}\nAnswer: ${text}`;
	// Clustering uses RAW claim text (no question prefix): every claim in a dataset
	// shares the same question, so the ctx format (used elsewhere for statement-vs-
	// claim retrieval) crushes pairwise similarity into a narrow high band (measured:
	// min 0.68, mean 0.85 with ctx vs min 0.10, mean 0.57 raw) — useless for a
	// similarity-threshold cut. Raw claim text spreads out on what actually differs.
	const clusterVectors = await cachedEmbedBatch(
		triplets.map((t) => claimCache.get(t.id)!.canonicalClaim),
		EMBEDDING_CACHE_FILE,
	);
	// Classification still needs ctx-formatted claim vectors (production's expected format
	// for the cosineByCluster hint passed into classifyHierarchical).
	const claimVectors = await cachedEmbedBatch(
		triplets.map((t) => ctx(claimCache.get(t.id)!.canonicalClaim)),
		EMBEDDING_CACHE_FILE,
	);

	const sim = similarityMatrix(clusterVectors);
	const clusters = clusterBySimilarity(sim, simThreshold);
	const sizes = clusters.map((c) => c.length).sort((a, b) => b - a);
	console.info(
		`[${dataset}] clustering @ threshold ${simThreshold}: ${clusters.length} clusters, sizes=${JSON.stringify(sizes)}`,
	);

	if (clusterOnly) {
		console.info(`[${dataset}] --cluster-only: stopping before naming/classification.`);

		return;
	}

	// Every cluster becomes its own topic — no size floor, no "unassigned" bucket.
	// A claim that falls through to root/unassigned is ALWAYS included in every
	// future candidate list (production's orphan safety net) — that's exactly
	// the mega-topic problem we started with, just re-introduced via a
	// different door. A cluster of 1-2 genuinely distinct claims should be
	// excludable when hop 1 routes elsewhere, not permanently swept back in.
	console.info(`[${dataset}] naming ${clusters.length} topic clusters (${minClusterSize}+ get an LLM title; smaller reuse their own claim text)...`);
	const topics: Array<{ title: string; explanation: string }> = [];
	const clusterOfClaimIdx = new Map<number, number>();
	for (let ti = 0; ti < clusters.length; ti++) {
		const memberIdxs = clusters[ti];
		for (const idx of memberIdxs) clusterOfClaimIdx.set(idx, ti);

		if (memberIdxs.length < minClusterSize) {
			// Too small to be worth an LLM call — the cluster's own claim text(s) already are the topic.
			const texts = memberIdxs.map((idx) => claimCache.get(triplets[idx].id)!.canonicalClaim);
			topics.push({ title: texts.join(' / '), explanation: '' });
			continue;
		}

		const sampleIdxs =
			memberIdxs.length <= 50
				? memberIdxs
				: [...memberIdxs].sort(() => Math.random() - 0.5).slice(0, 50);
		const claimLines = sampleIdxs
			.map((idx, i) => `${i + 1}. ${claimCache.get(triplets[idx].id)!.canonicalClaim}`)
			.join('\n');
		const text = await callLLM({
			model: WORKER_MODEL,
			system: CLUSTER_TOPIC_SYSTEM,
			user: `Question: "${questionText}"\n\nClaims in this cluster (${memberIdxs.length} total, ${sampleIdxs.length} shown):\n${claimLines}\n\nRespond with the JSON object.`,
			temperature: 0,
			maxTokens: 300,
			jsonMode: true,
		});
		const parsed = JSON.parse(extractJson(text)) as { title?: unknown; explanation?: unknown };
		topics.push({
			title: typeof parsed.title === 'string' ? parsed.title.trim() : `Topic ${ti + 1}`,
			explanation: typeof parsed.explanation === 'string' ? parsed.explanation.trim() : '',
		});
	}
	console.info(`[${dataset}] topics: ${JSON.stringify(topics.map((t) => t.title))}`);

	const topicClaims: ClusterClaim[] = topics.map((t, i) => ({
		clusterId: `topic:${dataset}:${i}`,
		canonicalClaim: t.title,
		publicExplanation: t.explanation,
		claimVersion: 1,
		claimStatus: 'confirmed',
		claimUpdatedAt: 0,
		isSynth: false,
		memberCount: 0,
		claimLevel: 'topic',
	}));
	const specifics: ClusterClaim[] = triplets.map((t, idx) => {
		const row = claimCache.get(t.id)!;
		const topicIdx = clusterOfClaimIdx.get(idx);

		return {
			clusterId: t.id,
			canonicalClaim: row.canonicalClaim,
			publicExplanation: row.publicExplanation,
			claimVersion: 1,
			claimStatus: 'confirmed',
			claimUpdatedAt: 0,
			isSynth: false,
			memberCount: 1,
			exemplar: t.anchor,
			claimLevel: 'specific' as const,
			parentClaimId: topicIdx !== undefined ? `topic:${dataset}:${topicIdx}` : null,
		};
	});
	const codebook = [...topicClaims, ...specifics];
	const childrenOf = (topicIds: string[]): number => {
		const ids = new Set(topicIds);

		return specifics.filter((c) => (c.parentClaimId && ids.has(c.parentClaimId)) || !c.parentClaimId).length;
	};

	const done = doneIds(RESULT_FILE);
	const todo = triplets.filter((t) => !done.has(t.id));
	if (todo.length === 0) {
		console.info(`[${dataset}] all ${triplets.length} triplets already done.`);

		return;
	}
	console.info(`[${dataset}] codebook=${specifics.length}+${topicClaims.length} topics, ${todo.length} triplets to classify`);

	const statementVectors = await cachedEmbedBatch(
		todo.flatMap((t) => [ctx(t.match), ctx(t.distractor)]),
		EMBEDDING_CACHE_FILE,
	);

	let completed = 0;
	await Promise.all(
		todo.map(async (t, ti) => {
			const classify = async (
				statementText: string,
				vector: number[],
			): Promise<{ result: HierarchicalClassification; candidateCount: number }> => {
				const cosineByCluster = new Map<string, number>(
					specifics.map((c, ci) => [c.clusterId, cosine(vector, claimVectors[ci])]),
				);
				const result = await classifyHierarchical({
					statementText,
					questionText,
					claims: codebook,
					cosineByCluster,
				});
				if (result.failedClosed) throw new Error(`failed closed for ${t.id}`);
				const candidateCount =
					result.method === 'registry-hier' ? childrenOf(result.routedTopicIds) : specifics.length;

				return { result, candidateCount };
			};

			const [m, d] = await Promise.all([
				classify(t.match, statementVectors[ti * 2]),
				classify(t.distractor, statementVectors[ti * 2 + 1]),
			]);

			appendJsonl(RESULT_FILE, {
				id: t.id,
				dataset,
				condition: 'CHC',
				codebookSize: specifics.length,
				topicCount: topicClaims.length,
				candidateCountMatch: m.candidateCount,
				candidateCountDistractor: d.candidateCount,
				match: m.result,
				distractor: d.result,
			} satisfies ClusteredRow);
			completed++;
			if (completed % 25 === 0) console.info(`  [${dataset}] ${completed}/${todo.length}`);
		}),
	);

	console.info(`Done → ${resultsPath(RESULT_FILE)}`);
}

main().catch((error) => {
	console.error('run-registry-clustered failed:', error);
	process.exit(1);
});
