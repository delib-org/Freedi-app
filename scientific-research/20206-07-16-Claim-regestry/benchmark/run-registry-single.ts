/**
 * Conditions B1 / B2 / D — the registry classifier on a single-claim codebook.
 *
 * For each triplet, seed a codebook with ONE claim derived from the anchor and
 * call the REAL production classifier (classifyAgainstClaims) on the match and
 * the distractor. Production attach rule applied downstream in analyze.ts:
 * attach iff relation === 'expresses' && confidence >= 0.6.
 *
 *   B1 (default)        claim text = the raw anchor statement
 *   B2 --generated-claims  claim text = generateClaim(anchor) canonical form
 *                          (production-faithful: claims are 5–15-word canonicals)
 *   D  --model gpt-4o      B1 re-run on the production audit model
 *
 * Condition A2 (embedding+judge) is derived in analyze.ts by gating these B1
 * decisions on the cached cosines — the judge call is identical, only the
 * retrieval gate differs — so it costs no extra LLM calls.
 *
 * Usage: npx tsx run-registry-single.ts [--file dev|main] [--limit N]
 *        [--sample results/pilot-ids.json] [--generated-claims] [--model gpt-4o]
 */
import { readFileSync } from 'node:fs';
import { loadEnv } from './lib/env';

loadEnv();

import {
	classifyAgainstClaims,
	generateClaim,
	type ClaimClassification,
	type ClusterClaim,
} from '../../../functions/src/services/claim-registry-service';
import { WORKER_MODEL } from '../../../functions/src/config/openai-chat';
import { loadTriplets, questionFor, type Triplet } from './lib/datasets';
import { appendJsonl, doneIds, readJsonl, resultsPath } from './lib/io';

export interface RegistryRow {
	id: string;
	dataset: string;
	condition: string;
	model: string;
	claimText: string;
	match: ClaimClassification;
	distractor: ClaimClassification;
}

interface GeneratedClaimRow {
	id: string;
	canonicalClaim: string;
	publicExplanation: string;
}

function makeClaim(clusterId: string, canonicalClaim: string): ClusterClaim {
	return {
		clusterId,
		canonicalClaim,
		publicExplanation: '',
		claimVersion: 1,
		claimStatus: 'confirmed',
		claimUpdatedAt: 0,
		isSynth: false,
		memberCount: 1,
	};
}

function parseArgs(): {
	file: 'dev' | 'main';
	limit?: number;
	sample?: string;
	generated: boolean;
	model: string;
} {
	const args = process.argv.slice(2);
	const get = (flag: string): string | undefined => {
		const i = args.indexOf(flag);

		return i >= 0 ? args[i + 1] : undefined;
	};

	return {
		file: (get('--file') ?? 'main') as 'dev' | 'main',
		limit: get('--limit') ? Number(get('--limit')) : undefined,
		sample: get('--sample'),
		generated: args.includes('--generated-claims'),
		model: get('--model') ?? WORKER_MODEL,
	};
}

/** Cache anchor → generated canonical claim (results/generated-claims.jsonl). */
const CLAIM_CACHE_FILE = 'generated-claims.jsonl';
const claimCache = new Map<string, string>();

function preloadClaimCache(): void {
	for (const row of readJsonl<GeneratedClaimRow>(CLAIM_CACHE_FILE)) {
		claimCache.set(row.id, row.canonicalClaim);
	}
}

async function generatedClaimFor(t: Triplet): Promise<string> {
	const cached = claimCache.get(t.id);
	if (cached) return cached;

	const generated = await generateClaim({ questionText: questionFor(t.dataset), texts: [t.anchor] });
	claimCache.set(t.id, generated.canonicalClaim);
	appendJsonl(CLAIM_CACHE_FILE, {
		id: t.id,
		canonicalClaim: generated.canonicalClaim,
		publicExplanation: generated.publicExplanation,
	} satisfies GeneratedClaimRow);

	return generated.canonicalClaim;
}

/**
 * classifyAgainstClaims fails CLOSED on exhausted retries (relation none,
 * confidence 0, empty reason) — correct for production, but here it would
 * silently score as a wrong answer. Under a sustained TPM ceiling (gpt-4o is
 * 30k tokens/min on this org) the 3 fast in-service retries are not enough,
 * so re-attempt at harness level with long backoff and treat a still-failing
 * triplet as a hard error rather than a data point.
 */
const FAILCLOSED_BACKOFF_MS = [15_000, 45_000, 90_000];

function isFailClosed(c: ClaimClassification): boolean {
	// failedClosed is the explicit marker; the shape check covers results
	// produced before the marker existed.
	return c.failedClosed === true || (c.relation === 'none' && c.confidence === 0 && c.reason === '');
}

async function classifyWithRetry(input: {
	statementText: string;
	questionText: string;
	claims: ClusterClaim[];
	model: string;
}): Promise<ClaimClassification> {
	let result = await classifyAgainstClaims(input);
	for (const delay of FAILCLOSED_BACKOFF_MS) {
		if (!isFailClosed(result)) return result;
		await new Promise((r) => setTimeout(r, delay));
		result = await classifyAgainstClaims(input);
	}
	if (isFailClosed(result)) {
		throw new Error(`classification failed closed after harness retries (model=${input.model})`);
	}

	return result;
}

async function main(): Promise<void> {
	const { file, limit, sample, generated, model } = parseArgs();
	const condition = generated ? 'B2' : model === WORKER_MODEL ? 'B1' : 'D';
	const resultFile = `registry-single-${condition}.jsonl`;

	let triplets = loadTriplets(file);
	if (sample) {
		const ids = new Set(JSON.parse(readFileSync(sample, 'utf8')) as string[]);
		triplets = triplets.filter((t) => ids.has(t.id));
	}
	if (limit) triplets = triplets.slice(0, limit);

	if (generated) preloadClaimCache();
	const done = doneIds(resultFile);
	const todo = triplets.filter((t) => !done.has(t.id));
	console.info(
		`Registry ${condition} (model=${model}): ${todo.length} triplets to classify (${done.size} already done)`,
	);

	let completed = 0;
	// callLLM is internally concurrency-limited (LLM_CONCURRENCY, default 10);
	// fire everything and let the limiter pace the API.
	await Promise.all(
		todo.map(async (t) => {
			const claimText = generated ? await generatedClaimFor(t) : t.anchor;
			const claims = [makeClaim(t.id, claimText)];
			const questionText = questionFor(t.dataset);

			const [matchResult, distractorResult] = await Promise.all([
				classifyWithRetry({ statementText: t.match, questionText, claims, model }),
				classifyWithRetry({ statementText: t.distractor, questionText, claims, model }),
			]);

			appendJsonl(resultFile, {
				id: t.id,
				dataset: t.dataset,
				condition,
				model,
				claimText,
				match: matchResult,
				distractor: distractorResult,
			} satisfies RegistryRow);
			completed++;
			if (completed % 25 === 0) console.info(`  classified ${completed}/${todo.length}`);
		}),
	);
	console.info(`Done → ${resultsPath(resultFile)}`);
}

main().catch((error) => {
	console.error('run-registry-single failed:', error);
	process.exit(1);
});
