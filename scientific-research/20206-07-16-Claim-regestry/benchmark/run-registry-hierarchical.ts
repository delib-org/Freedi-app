/**
 * Condition CH — Phase 2 two-hop hierarchical classification at production
 * scale, verified against condition CE2 (flat enriched codebooks).
 *
 * Simulates the structure Phase 3 will grow: per dataset, one LLM call writes
 * 3–8 topic claims from the claim list, then each specific claim is assigned
 * to a topic using the PRODUCTION routing function (routeToTopics). Each
 * match/distractor then goes through the production classifyHierarchical:
 * route → scoped classify → flat fallback on any "none".
 *
 * Success gates (plans/claim-registry-hierarchy-plan.md):
 *   accuracy within 2pp of the flat enriched run, fallback rate < 15%,
 *   mean candidate-list size < 40% of the full codebook.
 *
 * Usage: LLM_CONCURRENCY=4 npx tsx run-registry-hierarchical.ts [--limit N] [--sample ids.json]
 */
import { readFileSync } from 'node:fs';
import { loadEnv } from './lib/env';

loadEnv();

import {
	classifyHierarchical,
	routeToTopics,
	type ClusterClaim,
	type HierarchicalClassification,
} from '../../../functions/src/services/claim-registry-service';
import { callLLM, extractJson, getOpenAI, WORKER_MODEL } from '../../../functions/src/config/openai-chat';
import { loadTriplets, questionFor, type Triplet } from './lib/datasets';
import { appendJsonl, doneIds, readJsonl, resultsPath } from './lib/io';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const RESULT_FILE = 'registry-hierarchical-CH.jsonl';
const CLAIM_CACHE_FILE = 'generated-claims.jsonl';
const TOPIC_CACHE_FILE = 'topic-structure.jsonl';

interface GeneratedClaimRow {
	id: string;
	canonicalClaim: string;
	publicExplanation: string;
}

interface TopicStructureRow {
	dataset: string;
	topics: Array<{ title: string; explanation: string }>;
	/** claim id → 0-based topic index (or -1 for root). */
	assignments: Record<string, number>;
}

export interface HierRow {
	id: string;
	dataset: string;
	condition: 'CH';
	codebookSize: number;
	topicCount: number;
	candidateCountMatch: number;
	candidateCountDistractor: number;
	match: HierarchicalClassification;
	distractor: HierarchicalClassification;
}

const TOPICS_SYSTEM = `You organize the claims of a public deliberation question into topics. Topics are broad themes (drawers), claims are specific proposals (folders). Write 3–8 topics that together cover the claim list; each topic gets a 5–15-word neutral title and a one-sentence explanation. Topics must be themes, NOT proposals — nobody can "agree" with a topic.

Respond with JSON only: {"topics": [{"title": "...", "explanation": "..."}]}`;

function cosine(a: number[], b: number[]): number {
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}

	return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function embedBatch(inputs: string[]): Promise<number[][]> {
	const openai = getOpenAI();
	const out: number[][] = [];
	for (let i = 0; i < inputs.length; i += 100) {
		const response = await openai.embeddings.create({
			model: EMBEDDING_MODEL,
			input: inputs.slice(i, i + 100),
		});
		out.push(...response.data.map((d) => d.embedding));
	}

	return out;
}

/** Generate the topic layer for a dataset and assign every claim via production routing. */
async function buildTopicStructure(
	dataset: string,
	group: Triplet[],
	claimCache: Map<string, GeneratedClaimRow>,
): Promise<TopicStructureRow> {
	const requiredIds = group.map((t) => t.id);
	const cached = readJsonl<TopicStructureRow>(TOPIC_CACHE_FILE).find(
		(r) => r.dataset === dataset && requiredIds.every((id) => id in r.assignments),
	);
	if (cached) return cached;

	const questionText = questionFor(dataset);
	const claimLines = group
		.map((t, i) => `${i + 1}. ${claimCache.get(t.id)!.canonicalClaim}`)
		.join('\n');
	const text = await callLLM({
		model: WORKER_MODEL,
		system: TOPICS_SYSTEM,
		user: `Question: "${questionText}"\n\nClaims:\n${claimLines}\n\nRespond with the JSON object.`,
		temperature: 0,
		maxTokens: 800,
		jsonMode: true,
	});
	const parsed = JSON.parse(extractJson(text)) as {
		topics?: Array<{ title?: unknown; explanation?: unknown }>;
	};
	const topics = (parsed.topics ?? [])
		.filter((t) => typeof t.title === 'string' && (t.title as string).trim())
		.map((t) => ({
			title: (t.title as string).trim(),
			explanation: typeof t.explanation === 'string' ? t.explanation.trim() : '',
		}));
	if (topics.length < 2) throw new Error(`topic generation failed for ${dataset}`);

	// Assign each claim with the PRODUCTION routing function (first routed topic wins).
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
	const assignments: Record<string, number> = {};
	await Promise.all(
		group.map(async (t) => {
			const row = claimCache.get(t.id)!;
			const routed = await routeToTopics({
				statementText: `${row.canonicalClaim} — ${row.publicExplanation}`,
				questionText,
				topics: topicClaims,
			});
			assignments[t.id] =
				routed.length > 0 ? Number(routed[0].clusterId.split(':').pop()) : -1;
		}),
	);

	const structure: TopicStructureRow = { dataset, topics, assignments };
	appendJsonl(TOPIC_CACHE_FILE, structure);

	return structure;
}

function parseArgs(): { limit?: number; sample?: string } {
	const args = process.argv.slice(2);
	const get = (flag: string): string | undefined => {
		const i = args.indexOf(flag);

		return i >= 0 ? args[i + 1] : undefined;
	};

	return { limit: get('--limit') ? Number(get('--limit')) : undefined, sample: get('--sample') };
}

async function main(): Promise<void> {
	const { limit, sample } = parseArgs();
	let triplets = loadTriplets('main');
	if (sample) {
		const ids = new Set(JSON.parse(readFileSync(sample, 'utf8')) as string[]);
		triplets = triplets.filter((t) => ids.has(t.id));
	}
	if (limit) triplets = triplets.slice(0, limit);

	const claimCache = new Map<string, GeneratedClaimRow>();
	for (const row of readJsonl<GeneratedClaimRow>(CLAIM_CACHE_FILE)) claimCache.set(row.id, row);
	const missingClaims = triplets.filter((t) => !claimCache.has(t.id));
	if (missingClaims.length > 0) {
		throw new Error(
			`generated-claims.jsonl missing ${missingClaims.length} claims — run run-registry-single.ts --enriched first`,
		);
	}

	const done = doneIds(RESULT_FILE);
	const byDataset = new Map<string, Triplet[]>();
	for (const t of triplets) {
		const arr = byDataset.get(t.dataset) ?? [];
		arr.push(t);
		byDataset.set(t.dataset, arr);
	}

	for (const [dataset, group] of byDataset) {
		const questionText = questionFor(dataset);
		const structure = await buildTopicStructure(dataset, group, claimCache);
		console.info(`[${dataset}] ${structure.topics.length} topics`);

		const topicClaims: ClusterClaim[] = structure.topics.map((t, i) => ({
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
		const specifics: ClusterClaim[] = group.map((t) => {
			const row = claimCache.get(t.id)!;
			const topicIndex = structure.assignments[t.id] ?? -1;

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
				parentClaimId: topicIndex >= 0 ? `topic:${dataset}:${topicIndex}` : null,
			};
		});
		const codebook = [...topicClaims, ...specifics];
		const childrenOf = (topicIds: string[]): number => {
			const ids = new Set(topicIds);

			return specifics.filter((c) => (c.parentClaimId && ids.has(c.parentClaimId)) || !c.parentClaimId).length;
		};

		const todo = group.filter((t) => !done.has(t.id));
		if (todo.length === 0) continue;
		console.info(`[${dataset}] codebook=${specifics.length}+${topicClaims.length} topics, ${todo.length} triplets`);

		// Cosine evidence over specifics (production ctx format), as in C/CE.
		const ctx = (text: string): string => `Question: ${questionText}\nAnswer: ${text}`;
		const claimVectors = await embedBatch(specifics.map((c) => ctx(c.canonicalClaim)));
		const statementVectors = await embedBatch(todo.flatMap((t) => [ctx(t.match), ctx(t.distractor)]));

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
						result.method === 'registry-hier'
							? childrenOf(result.routedTopicIds)
							: specifics.length;

					return { result, candidateCount };
				};

				const [m, d] = await Promise.all([
					classify(t.match, statementVectors[ti * 2]),
					classify(t.distractor, statementVectors[ti * 2 + 1]),
				]);

				appendJsonl(RESULT_FILE, {
					id: t.id,
					dataset,
					condition: 'CH',
					codebookSize: specifics.length,
					topicCount: topicClaims.length,
					candidateCountMatch: m.candidateCount,
					candidateCountDistractor: d.candidateCount,
					match: m.result,
					distractor: d.result,
				} satisfies HierRow);
				completed++;
				if (completed % 25 === 0) console.info(`  [${dataset}] ${completed}/${todo.length}`);
			}),
		);
	}
	console.info(`Done → ${resultsPath(RESULT_FILE)}`);
}

main().catch((error) => {
	console.error('run-registry-hierarchical failed:', error);
	process.exit(1);
});
