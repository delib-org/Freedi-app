/**
 * Loads and normalizes the Procaccia hard-triplet files
 * (Blair, Procaccia & Tambe, "Embeddings for Preferences, Not Semantics").
 *
 * Two schemas exist:
 *   hard_eval_triplets.jsonl     — {dataset, anchor, paraphrase, flip}            (100, dev)
 *   hard_eval_triplets_1k.jsonl  — {dataset, anchor, preference_match,
 *                                   semantic_distractor, participant_id}          (875, main)
 *
 * Both normalize to Triplet: the `match` shares the anchor's stance in different
 * words; the `distractor` shares the anchor's wording but flips the stance.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DATASET_DIR } from './env';

export interface Triplet {
	/** Stable id: `<file-tag>:<line-index>` — keys the resumable result logs. */
	id: string;
	dataset: string;
	anchor: string;
	match: string;
	distractor: string;
}

interface RawRow {
	dataset: string;
	anchor: string;
	paraphrase?: string;
	flip?: string;
	preference_match?: string;
	semantic_distractor?: string;
}

/**
 * Question text per source dataset, inferred from the paper's §3 / Appendix B
 * dataset descriptions (the triplet files do not carry the question). The
 * registry classifier receives the question as context in production, so the
 * benchmark supplies it too. Reported as an approximation in TEST_REPORT.md.
 */
export const QUESTION_BY_DATASET: Record<string, string> = {
	polis_15_per_hour_seattle: 'Should Seattle raise the minimum wage to $15 per hour?',
	polis_american_assembly_bowling_green:
		'What should change in Bowling Green / Warren County to make it a better place to live, work, and spend time?',
	polis_brexit_consensus: 'What should the United Kingdom’s approach to Brexit be?',
	polis_canadian_electoral_reform: 'Should Canada reform its federal electoral system?',
	polis_scoop_hivemind_ubi: 'Should a Universal Basic Income be introduced?',
	remesh_campus_protests: 'How should universities handle campus protests?',
	remesh_foreign_intervention:
		'When, if ever, should the United States intervene militarily in foreign conflicts?',
	remesh_right_to_assemble: 'What are your views on the right to assemble and protest?',
	gsc_abortion_gen: 'What is your opinion on abortion policy?',
	gsc_abortion_val: 'What is your opinion on abortion policy?',
	gsc_chatbot_gen: 'How should AI chatbots be personalized to their users?',
};

export function questionFor(dataset: string): string {
	return QUESTION_BY_DATASET[dataset] ?? 'What is your opinion on this issue?';
}

export function loadTriplets(file: 'dev' | 'main'): Triplet[] {
	const name = file === 'dev' ? 'hard_eval_triplets.jsonl' : 'hard_eval_triplets_1k.jsonl';
	const tag = file === 'dev' ? 'dev' : 'main';
	const lines = readFileSync(resolve(DATASET_DIR, name), 'utf8').split('\n').filter(Boolean);

	return lines.map((line, i) => {
		const raw = JSON.parse(line) as RawRow;
		const match = raw.paraphrase ?? raw.preference_match;
		const distractor = raw.flip ?? raw.semantic_distractor;
		if (!match || !distractor) {
			throw new Error(`Row ${i} of ${name} missing match/distractor fields`);
		}

		return { id: `${tag}:${i}`, dataset: raw.dataset, anchor: raw.anchor, match, distractor };
	});
}

/** Deterministic PRNG (mulberry32) — reproducible stratified sampling. */
function mulberry32(seed: number): () => number {
	let a = seed >>> 0;

	return () => {
		a += 0x6d2b79f5;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Stratified sample of `n` triplets, proportional per dataset (largest-remainder
 * apportionment, at least 1 per dataset), seeded for reproducibility.
 */
export function stratifiedSample(triplets: Triplet[], n: number, seed = 20260716): Triplet[] {
	const rand = mulberry32(seed);
	const byDataset = new Map<string, Triplet[]>();
	for (const t of triplets) {
		const arr = byDataset.get(t.dataset) ?? [];
		arr.push(t);
		byDataset.set(t.dataset, arr);
	}

	const groups = [...byDataset.entries()];
	const total = triplets.length;
	const quotas = groups.map(([, arr]) => (arr.length / total) * n);
	const counts = quotas.map((q) => Math.max(1, Math.floor(q)));
	let assigned = counts.reduce((a, b) => a + b, 0);
	const remainders = quotas
		.map((q, i) => ({ i, frac: q - Math.floor(q) }))
		.sort((a, b) => b.frac - a.frac);
	for (const { i } of remainders) {
		if (assigned >= n) break;
		counts[i]++;
		assigned++;
	}

	const sample: Triplet[] = [];
	groups.forEach(([, arr], gi) => {
		const shuffled = [...arr];
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(rand() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}
		sample.push(...shuffled.slice(0, Math.min(counts[gi], shuffled.length)));
	});

	return sample.slice(0, n);
}
