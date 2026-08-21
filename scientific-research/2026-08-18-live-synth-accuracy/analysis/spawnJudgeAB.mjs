/**
 * The spawn judge's merge/refuse line, measured — in both languages, on both
 * error directions.
 *
 * `he-seed42-large-recall` exposed a language asymmetry in
 * `generateSynthesizedProposal`'s Stage-1 coherence check. On Hebrew it
 * REFUSED true paraphrase twins whose two wordings differ in specificity —
 * "add speed bumps and raised crossings near schools" vs "install
 * traffic-calming measures near schools" ("the proposals share the goal…but
 * propose different physical measures") — while it MERGED genuinely distinct
 * same-lever pairs (peak-hour bus frequency ↔ late-night weekend service).
 * The same pairs in English merge and refuse correctly (Finding 9: 150/150,
 * zero false merges). One line, drawn wrong in both directions, only in
 * Hebrew.
 *
 * This bench drives the COMPILED function (Finding 8: measuring a restatement
 * measures the restatement) over:
 *
 *   POSITIVES — all 50 ground-truth twin pairs per language (must merge)
 *   NEGATIVES — the K highest-cosine same-topic cross-synth pairs per
 *     language (must refuse; these are exactly the pairs the spawn band puts
 *     in front of the judge, per heBands.mjs)
 *
 * and reports accept/refuse per class. Run it before and after a prompt edit
 * with different --label values; the label keys the cache, so an A/B is two
 * labelled runs either side of a rebuild.
 *
 *   usage: node spawnJudgeAB.mjs [--label=NAME] [--negatives=10] [--langs=en,he]
 *   env:   OPENAI_API_KEY via functions/.env
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { loadEnv } from '../textFidelity.mjs';

const REPO = '/Users/talyaron/Documents/Freedi-app';
const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const LABEL = (args.find((a) => a.startsWith('--label=')) ?? '--label=baseline').split('=')[1];
const NEGATIVES = Number((args.find((a) => a.startsWith('--negatives=')) ?? '--negatives=10').split('=')[1]);
const LANGS = ((args.find((a) => a.startsWith('--langs=')) ?? '--langs=en,he').split('=')[1] ?? '')
	.split(',')
	.filter(Boolean);

loadEnv();

const { generateSynthesizedProposal } = require(
	resolve(REPO, 'functions/lib/functions/src/services/integration-ai-service.js'),
);

const CACHE_FILE = resolve(REPO, 'scripts/.cache/spawn-judge-ab.jsonl');
mkdirSync(resolve(REPO, 'scripts/.cache'), { recursive: true });
const cache = new Map();
if (existsSync(CACHE_FILE)) {
	for (const line of readFileSync(CACHE_FILE, 'utf8').split('\n')) {
		if (!line.trim()) continue;
		const r = JSON.parse(line);
		cache.set(r.key, r.value);
	}
}

/** 3-large HE cosines from the band study; EN uses the shared preflight cache. */
function cosineMap(lang, corpus) {
	const vecs = new Map();
	const key = (t) => `Question: ${corpus.questionText}\nAnswer: ${t}`;
	if (lang === 'he' && existsSync(resolve(REPO, 'scripts/.cache/he-large-embeddings.json'))) {
		const raw = JSON.parse(
			readFileSync(resolve(REPO, 'scripts/.cache/he-large-embeddings.json'), 'utf8'),
		);
		for (const [k, v] of Object.entries(raw)) vecs.set(k, v);
	} else {
		for (const line of readFileSync(
			resolve(REPO, 'scripts/.cache/preflight-embeddings.jsonl'),
			'utf8',
		).split('\n')) {
			if (!line.trim()) continue;
			const r = JSON.parse(line);
			vecs.set(r.key, r.vector);
		}
	}
	const dot = (a, b) => {
		let s = 0;
		for (let i = 0; i < a.length; i++) s += a[i] * b[i];

		return s;
	};

	return (a, b) => {
		const va = vecs.get(key(a));
		const vb = vecs.get(key(b));
		if (!va || !vb) return null;

		return dot(va, vb) / Math.sqrt(dot(va, va) * dot(vb, vb));
	};
}

async function judge(lang, question, a, b) {
	const key = `${LABEL}::${lang}::${a}::${b}`;
	if (cache.has(key)) return cache.get(key);
	const res = await generateSynthesizedProposal(
		[
			{ statementId: 'A', statement: a, numberOfEvaluators: 1, consensus: 0.5, sumEvaluations: 1 },
			{ statementId: 'B', statement: b, numberOfEvaluators: 1, consensus: 0.5, sumEvaluations: 1 },
		],
		question,
	);
	const value = { merged: !res.cannotSynthesize, reason: res.cannotSynthesize ? res.reason : '' };
	cache.set(key, value);
	writeFileSync(CACHE_FILE, `${JSON.stringify({ key, value })}\n`, { flag: 'a' });

	return value;
}

for (const lang of LANGS) {
	const corpus = JSON.parse(
		readFileSync(resolve(REPO, `scripts/seedSynthBenchmark.accuracy100.${lang}.json`), 'utf8'),
	);
	const cos = cosineMap(lang, corpus);

	const positives = [];
	const statements = [];
	for (const t of corpus.topics)
		for (const s of t.synths) {
			if (s.paraphrases.length === 2)
				positives.push({ name: s.name, a: s.paraphrases[0], b: s.paraphrases[1] });
			for (const p of s.paraphrases) statements.push({ topic: t.name, synth: s.name, text: p });
		}

	// Hard negatives: highest-cosine same-topic cross-synth pairs — the ones
	// the spawn band actually puts in front of the judge.
	const negPairs = [];
	for (let i = 0; i < statements.length; i++)
		for (let j = i + 1; j < statements.length; j++) {
			const A = statements[i];
			const B = statements[j];
			if (A.topic !== B.topic || A.synth === B.synth) continue;
			const c = cos(A.text, B.text);
			if (c !== null) negPairs.push({ name: `${A.synth} × ${B.synth}`, a: A.text, b: B.text, c });
		}
	negPairs.sort((x, y) => y.c - x.c);
	const negatives = [];
	const seenCombo = new Set();
	for (const p of negPairs) {
		if (seenCombo.has(p.name)) continue;
		seenCombo.add(p.name);
		negatives.push(p);
		if (negatives.length >= NEGATIVES) break;
	}

	let posMerged = 0;
	const posRefusals = [];
	for (const p of positives) {
		const v = await judge(lang, corpus.questionText, p.a, p.b);
		if (v.merged) posMerged++;
		else posRefusals.push(`${p.name}: ${v.reason}`);
	}
	let negRefused = 0;
	const negMerges = [];
	for (const p of negatives) {
		const v = await judge(lang, corpus.questionText, p.a, p.b);
		if (!v.merged) negRefused++;
		else negMerges.push(`${p.name} (cosine ${p.c.toFixed(3)})`);
	}

	console.log(`\n=== ${lang} (${LABEL})`);
	console.log(`  twins merged      ${posMerged}/${positives.length}`);
	console.log(`  negatives refused ${negRefused}/${negatives.length}`);
	for (const r of posRefusals) console.log(`    WRONG REFUSAL  ${r}`);
	for (const m of negMerges) console.log(`    WRONG MERGE    ${m}`);
}
