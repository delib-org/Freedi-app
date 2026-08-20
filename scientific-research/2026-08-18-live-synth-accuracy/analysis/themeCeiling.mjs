/**
 * Offline: what could ever fix the theming half?
 *
 * Round 2 reached topic F1 0.434, and the best single pairwise cut on this
 * geometry is 0.480 — so the greedy rule is at ~90% of its own ceiling and
 * threshold tuning is exhausted. Two candidate levers remain. This measures
 * both, on the same 50 synth centroids:
 *
 *   A. a GLOBAL assignment (agglomerative average-linkage to exactly 10 groups)
 *      instead of greedy pairwise attach;
 *   B. a better embedding model (text-embedding-3-large @1536).
 *
 * Embeds into its OWN cache file — the preflight cache keys on text alone, so
 * writing 3-large vectors into it would silently corrupt every later 3-small run.
 *
 *   usage: node themeCeiling.mjs [corpus.json]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = '/Users/talyaron/Documents/Freedi-app';
const HERE = '/private/tmp/claude-501/-Users-talyaron-Documents-Freedi-app/495537ad-93d7-4fdd-b70c-3c4962e257d3/scratchpad';
const corpus = JSON.parse(
	readFileSync(resolve(REPO, process.argv[2] ?? 'scripts/seedSynthBenchmark.accuracy100.en.json'), 'utf8'),
);
const key = (t) => `Question: ${corpus.questionText}\nAnswer: ${t}`;

// --- env ---
for (const line of readFileSync(resolve(REPO, 'functions/.env'), 'utf8').split('\n')) {
	const t = line.trim();
	if (!t || t.startsWith('#')) continue;
	const i = t.indexOf('=');
	if (i === -1) continue;
	const k = t.slice(0, i).trim();
	let v = t.slice(i + 1).trim();
	if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
	if (!(k in process.env)) process.env[k] = v;
}

const smallCache = new Map();
for (const line of readFileSync(resolve(REPO, 'scripts/.cache/preflight-embeddings.jsonl'), 'utf8').split('\n')) {
	if (!line.trim()) continue;
	const r = JSON.parse(line);
	smallCache.set(r.key, r.vector);
}

const texts = [];
for (const t of corpus.topics) for (const s of t.synths) for (const p of s.paraphrases) texts.push(p);

async function embedLarge() {
	const lang = corpus.language ?? 'en';
	const file = resolve(HERE, `large-${lang}.json`);
	if (existsSync(file)) return new Map(Object.entries(JSON.parse(readFileSync(file, 'utf8'))));
	const out = {};
	for (let i = 0; i < texts.length; i += 50) {
		const batch = texts.slice(i, i + 50);
		const res = await fetch('https://api.openai.com/v1/embeddings', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
			},
			body: JSON.stringify({
				model: 'text-embedding-3-large',
				dimensions: 1536,
				input: batch.map(key),
			}),
		});
		if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
		const j = await res.json();
		j.data.forEach((d, n) => { out[key(batch[n])] = d.embedding; });
		console.error(`  embedded ${Math.min(i + 50, texts.length)}/${texts.length}`);
	}
	writeFileSync(file, JSON.stringify(out));

	return new Map(Object.entries(out));
}

const dot = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += a[i] * b[i]; return d; };
const cos = (a, b) => dot(a, b) / Math.sqrt(dot(a, a) * dot(b, b));
const centroid = (vs) => { const d = vs[0].length, s = new Array(d).fill(0); for (const v of vs) for (let i = 0; i < d; i++) s[i] += v[i]; return s.map((x) => x / vs.length); };
const f = (x) => x.toFixed(3);

function buildSynths(cache) {
	const out = [];
	for (const t of corpus.topics) {
		for (const s of t.synths) {
			const vs = s.paraphrases.map((p) => cache.get(key(p))).filter(Boolean);
			if (vs.length !== 2) continue;
			out.push({ topic: t.name, name: s.name, vec: centroid(vs) });
		}
	}
	return out;
}

/** Pairwise P/R/F1 of a labelling against ground-truth themes. */
function pairwise(items, labels) {
	let tp = 0, fp = 0, fn = 0;
	for (let i = 0; i < items.length; i++)
		for (let j = i + 1; j < items.length; j++) {
			const sameTruth = items[i].topic === items[j].topic;
			const samePred = labels[i] === labels[j];
			if (samePred && sameTruth) tp++;
			else if (samePred) fp++;
			else if (sameTruth) fn++;
		}
	const p = tp / (tp + fp || 1), r = tp / (tp + fn || 1);
	return { p, r, f1: p + r ? 2 * p * r / (p + r) : 0 };
}

/** Agglomerative average-linkage down to exactly k groups. */
function agglomerative(items, k) {
	let groups = items.map((_, i) => [i]);
	const sim = items.map((a) => items.map((b) => cos(a.vec, b.vec)));
	while (groups.length > k) {
		let best = -Infinity, bi = 0, bj = 1;
		for (let i = 0; i < groups.length; i++)
			for (let j = i + 1; j < groups.length; j++) {
				let s = 0;
				for (const x of groups[i]) for (const y of groups[j]) s += sim[x][y];
				s /= groups[i].length * groups[j].length;
				if (s > best) { best = s; bi = i; bj = j; }
			}
		groups[bi] = groups[bi].concat(groups[bj]);
		groups.splice(bj, 1);
	}
	const labels = new Array(items.length);
	groups.forEach((g, gi) => g.forEach((x) => { labels[x] = gi; }));
	return labels;
}

function report(tag, synths) {
	console.log(`\n===== ${tag} =====`);
	// greedy pairwise ceiling
	const same = [], diff = [];
	for (let i = 0; i < synths.length; i++)
		for (let j = i + 1; j < synths.length; j++) {
			const c = cos(synths[i].vec, synths[j].vec);
			(synths[i].topic === synths[j].topic ? same : diff).push(c);
		}
	let bf = 0, bc = 0;
	for (let cut = 0.5; cut <= 0.98; cut += 0.005) {
		const tp = same.filter((x) => x >= cut).length, fp = diff.filter((x) => x >= cut).length;
		const p = tp / (tp + fp || 1), r = tp / same.length;
		const s = p + r ? 2 * p * r / (p + r) : 0;
		if (s > bf) { bf = s; bc = cut; }
	}
	console.log(`greedy pairwise ceiling      cut ${f(bc)} -> F1 ${f(bf)}`);

	// nearest theme centroid, hold-one-out
	const themes = [...new Set(synths.map((s) => s.topic))];
	let correct = 0;
	for (const s of synths) {
		const bestT = themes.map((t) => {
			const others = synths.filter((x) => x.topic === t && x.name !== s.name);
			return { t, c: cos(s.vec, centroid(others.map((o) => o.vec))) };
		}).sort((a, b) => b.c - a.c)[0].t;
		if (bestT === s.topic) correct++;
	}
	console.log(`nearest theme centroid       ${correct}/${synths.length} correct`);

	// global assignment
	const g = pairwise(synths, agglomerative(synths, 10));
	console.log(`GLOBAL agglomerative (k=10)  P ${f(g.p)}  R ${f(g.r)}  F1 ${f(g.f1)}`);
}

const small = buildSynths(smallCache);
report('text-embedding-3-small (shipped)', small);
console.error('\nembedding with text-embedding-3-large...');
const large = buildSynths(await embedLarge());
report('text-embedding-3-large @1536', large);
