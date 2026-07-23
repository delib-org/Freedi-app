/**
 * Condition A — embedding-cosine baseline on the hard triplets.
 *
 * Embeds anchor / match / distractor with the production embedding model
 * (text-embedding-3-small) in two input formats:
 *   raw — the bare text                       → paper-comparable triplet accuracy
 *   ctx — "Question: …\nAnswer: …" (the exact format production stores, see
 *         functions/src/services/embedding-service.ts) → pipeline-threshold simulation
 *
 * Writes results/cosines.jsonl: {id, dataset, cosRawMatch, cosRawDistractor,
 * cosCtxMatch, cosCtxDistractor}. Resumable; reused by A2 gating in analyze.ts.
 *
 * Usage: npx tsx run-cosine-baseline.ts [--file dev|main] [--limit N] [--sample results/pilot-ids.json]
 */
import { readFileSync } from 'node:fs';
import { loadEnv } from './lib/env';

loadEnv();

import { getOpenAI } from '../../../functions/src/config/openai-chat';
import { loadTriplets, questionFor, type Triplet } from './lib/datasets';
import { appendJsonl, doneIds, resultsPath } from './lib/io';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const RESULT_FILE = 'cosines.jsonl';
const BATCH_SIZE = 100;

export interface CosineRow {
	id: string;
	dataset: string;
	cosRawMatch: number;
	cosRawDistractor: number;
	cosCtxMatch: number;
	cosCtxDistractor: number;
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

function parseArgs(): { file: 'dev' | 'main'; limit?: number; sample?: string } {
	const args = process.argv.slice(2);
	const get = (flag: string): string | undefined => {
		const i = args.indexOf(flag);

		return i >= 0 ? args[i + 1] : undefined;
	};

	return {
		file: (get('--file') ?? 'main') as 'dev' | 'main',
		limit: get('--limit') ? Number(get('--limit')) : undefined,
		sample: get('--sample'),
	};
}

async function main(): Promise<void> {
	const { file, limit, sample } = parseArgs();
	let triplets = loadTriplets(file);
	if (sample) {
		const ids = new Set(JSON.parse(readFileSync(sample, 'utf8')) as string[]);
		triplets = triplets.filter((t) => ids.has(t.id));
	}
	if (limit) triplets = triplets.slice(0, limit);

	const done = doneIds(RESULT_FILE);
	const todo = triplets.filter((t) => !done.has(t.id));
	console.info(`Cosine baseline: ${todo.length} to embed (${done.size} already done)`);
	if (todo.length === 0) return;

	const openai = getOpenAI();

	// 6 inputs per triplet: [raw a, raw m, raw d, ctx a, ctx m, ctx d]
	const inputsFor = (t: Triplet): string[] => {
		const q = questionFor(t.dataset);
		const ctx = (text: string): string => `Question: ${q}\nAnswer: ${text}`;

		return [t.anchor, t.match, t.distractor, ctx(t.anchor), ctx(t.match), ctx(t.distractor)];
	};

	const perBatch = Math.floor(BATCH_SIZE / 6) * 6;
	for (let i = 0; i < todo.length; i += perBatch / 6) {
		const batch = todo.slice(i, i + perBatch / 6);
		const inputs = batch.flatMap(inputsFor);
		const response = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: inputs });
		const vectors = response.data.map((d) => d.embedding);

		batch.forEach((t, j) => {
			const [ra, rm, rd, ca, cm, cd] = vectors.slice(j * 6, j * 6 + 6);
			const row: CosineRow = {
				id: t.id,
				dataset: t.dataset,
				cosRawMatch: cosine(ra, rm),
				cosRawDistractor: cosine(ra, rd),
				cosCtxMatch: cosine(ca, cm),
				cosCtxDistractor: cosine(ca, cd),
			};
			appendJsonl(RESULT_FILE, row);
		});
		console.info(`  embedded ${Math.min(i + batch.length, todo.length)}/${todo.length}`);
	}
	console.info(`Done → ${resultsPath(RESULT_FILE)}`);
}

main().catch((error) => {
	console.error('run-cosine-baseline failed:', error);
	process.exit(1);
});
