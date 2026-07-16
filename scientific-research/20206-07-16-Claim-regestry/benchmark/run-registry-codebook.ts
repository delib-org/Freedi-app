/**
 * Condition C — the registry classifier at production scale: a full per-dataset
 * codebook of generated canonical claims (one per anchor, 13–100 claims), ordered
 * exactly as production orders it (orderClaimsForClassification with real cosine
 * evidence), then one classify call per match/distractor.
 *
 * Scoring (in analyze.ts): match correct iff matchedClusterId === its own
 * anchor's claim; distractor correct iff matchedClusterId !== its anchor's claim.
 * "expresses-any" reported as a secondary rate (near-duplicate anchors make
 * cross-matches legitimate sometimes).
 *
 * Requires: results/generated-claims.jsonl covering the target triplets
 * (produced by run-registry-single.ts --generated-claims); missing claims are
 * generated here and appended to the same cache.
 *
 * Usage: npx tsx run-registry-codebook.ts [--file dev|main] [--limit N] [--sample ids.json]
 */
import { readFileSync } from 'node:fs';
import { loadEnv } from './lib/env';

loadEnv();

import {
	classifyAgainstClaims,
	generateClaim,
	orderClaimsForClassification,
	type ClaimClassification,
	type ClusterClaim,
} from '../../../functions/src/services/claim-registry-service';
import { getOpenAI, WORKER_MODEL } from '../../../functions/src/config/openai-chat';
import { loadTriplets, questionFor, type Triplet } from './lib/datasets';
import { appendJsonl, doneIds, readJsonl, resultsPath } from './lib/io';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const RESULT_FILE_BASE = 'registry-codebook';
const CLAIM_CACHE_FILE = 'generated-claims.jsonl';

interface GeneratedClaimRow {
	id: string;
	canonicalClaim: string;
	publicExplanation: string;
}

export interface CodebookRow {
	id: string;
	dataset: string;
	condition: 'C' | 'CE';
	codebookSize: number;
	/** 1-based position of the triplet's own anchor claim in the prompt list. */
	anchorRankMatch: number;
	anchorRankDistractor: number;
	match: ClaimClassification;
	distractor: ClaimClassification;
}

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

function parseArgs(): { file: 'dev' | 'main'; limit?: number; sample?: string; enriched: boolean } {
	const args = process.argv.slice(2);
	const get = (flag: string): string | undefined => {
		const i = args.indexOf(flag);

		return i >= 0 ? args[i + 1] : undefined;
	};

	return {
		file: (get('--file') ?? 'main') as 'dev' | 'main',
		limit: get('--limit') ? Number(get('--limit')) : undefined,
		sample: get('--sample'),
		// Phase 0 enrichment: publicExplanation + anchor exemplar on every codebook line.
		enriched: args.includes('--enriched'),
	};
}

async function main(): Promise<void> {
	const { file, limit, sample, enriched } = parseArgs();
	const condition = enriched ? 'CE' : 'C';
	const resultFile = `${RESULT_FILE_BASE}-${condition}.jsonl`;
	let triplets = loadTriplets(file);
	if (sample) {
		const ids = new Set(JSON.parse(readFileSync(sample, 'utf8')) as string[]);
		triplets = triplets.filter((t) => ids.has(t.id));
	}
	if (limit) triplets = triplets.slice(0, limit);

	// 1. Canonical claim per anchor (cache-first).
	const claimCache = new Map<string, GeneratedClaimRow>();
	for (const row of readJsonl<GeneratedClaimRow>(CLAIM_CACHE_FILE)) {
		claimCache.set(row.id, row);
	}
	const missing = triplets.filter((t) => !claimCache.has(t.id));
	console.info(`Codebook C: ${missing.length} claims to generate (${claimCache.size} cached)`);
	await Promise.all(
		missing.map(async (t) => {
			const generated = await generateClaim({
				questionText: questionFor(t.dataset),
				texts: [t.anchor],
			});
			const row: GeneratedClaimRow = {
				id: t.id,
				canonicalClaim: generated.canonicalClaim,
				publicExplanation: generated.publicExplanation,
			};
			claimCache.set(t.id, row);
			appendJsonl(CLAIM_CACHE_FILE, row);
		}),
	);

	const done = doneIds(resultFile);
	const byDataset = new Map<string, Triplet[]>();
	for (const t of triplets) {
		const arr = byDataset.get(t.dataset) ?? [];
		arr.push(t);
		byDataset.set(t.dataset, arr);
	}

	for (const [dataset, group] of byDataset) {
		const questionText = questionFor(dataset);
		const claims: ClusterClaim[] = group.map((t) => ({
			clusterId: t.id,
			canonicalClaim: claimCache.get(t.id)!.canonicalClaim,
			publicExplanation: enriched ? claimCache.get(t.id)!.publicExplanation : '',
			claimVersion: 1,
			claimStatus: 'confirmed',
			claimUpdatedAt: 0,
			isSynth: false,
			memberCount: 1,
			exemplar: enriched ? t.anchor : undefined,
		}));

		const todo = group.filter((t) => !done.has(t.id));
		if (todo.length === 0) continue;
		console.info(`[${dataset}] codebook=${claims.length} claims, ${todo.length} triplets`);

		// 2. Cosine evidence for production-faithful ordering: embed claims once,
		//    and each statement, all in the production ctx format.
		const ctx = (text: string): string => `Question: ${questionText}\nAnswer: ${text}`;
		const claimVectors = await embedBatch(claims.map((c) => ctx(c.canonicalClaim)));
		const statementVectors = await embedBatch(todo.flatMap((t) => [ctx(t.match), ctx(t.distractor)]));

		let completed = 0;
		await Promise.all(
			todo.map(async (t, ti) => {
				const classifyOrdered = async (
					statementText: string,
					vector: number[],
				): Promise<{ result: ClaimClassification; anchorRank: number }> => {
					const cosineByCluster = new Map<string, number>(
						claims.map((c, ci) => [c.clusterId, cosine(vector, claimVectors[ci])]),
					);
					const ordered = orderClaimsForClassification(claims, cosineByCluster);
					const anchorRank = ordered.findIndex((c) => c.clusterId === t.id) + 1;
					const result = await classifyAgainstClaims({
						statementText,
						questionText,
						claims: ordered,
						model: WORKER_MODEL,
					});
					// classifyAgainstClaims fails closed; never persist a poisoned row —
					// the run is resumable, so a re-run picks the triplet up again.
					if (
						result.failedClosed === true ||
						(result.relation === 'none' && result.confidence === 0 && result.reason === '')
					) {
						throw new Error(`classification failed closed for ${t.id}`);
					}

					return { result, anchorRank };
				};

				const [m, d] = await Promise.all([
					classifyOrdered(t.match, statementVectors[ti * 2]),
					classifyOrdered(t.distractor, statementVectors[ti * 2 + 1]),
				]);

				appendJsonl(resultFile, {
					id: t.id,
					dataset,
					condition,
					codebookSize: claims.length,
					anchorRankMatch: m.anchorRank,
					anchorRankDistractor: d.anchorRank,
					match: m.result,
					distractor: d.result,
				} satisfies CodebookRow);
				completed++;
				if (completed % 25 === 0) console.info(`  [${dataset}] ${completed}/${todo.length}`);
			}),
		);
	}
	console.info(`Done → ${resultsPath(resultFile)}`);
}

main().catch((error) => {
	console.error('run-registry-codebook failed:', error);
	process.exit(1);
});
