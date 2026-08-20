/**
 * Offline: with the synthesis half solved, how well can 50 syntheses be sorted
 * into their 10 themes?
 *
 * Round 2 recovered every pair, so the pipeline now really does hold ~50 clean
 * 2-member syntheses. The remaining loss is theming: cluster 0.500, topic F1
 * 0.434, 12 themes produced against 10. This asks whether that is a mechanism
 * problem or a geometry ceiling.
 *
 * Each ground-truth synth becomes one point (centroid of its 2 paraphrases).
 * Then three questions:
 *   1. Is the correct theme the nearest theme centroid? (the greedy rule)
 *   2. Is the nearest OTHER synth in the same theme? (the pairwise rule the
 *      sub-synth spawn band actually uses)
 *   3. What does a global assignment achieve — k-means style, seeded from truth?
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = '/Users/talyaron/Documents/Freedi-app';
const corpus = JSON.parse(
	readFileSync(resolve(REPO, process.argv[2] ?? 'scripts/seedSynthBenchmark.accuracy100.en.json'), 'utf8'),
);
const cache = new Map();
for (const line of readFileSync(resolve(REPO, 'scripts/.cache/preflight-embeddings.jsonl'), 'utf8').split('\n')) {
	if (!line.trim()) continue;
	const r = JSON.parse(line);
	cache.set(r.key, r.vector);
}
const key = (t) => `Question: ${corpus.questionText}\nAnswer: ${t}`;

const dot = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += a[i] * b[i]; return d; };
const cos = (a, b) => dot(a, b) / Math.sqrt(dot(a, a) * dot(b, b));
const centroid = (vs) => { const d = vs[0].length, s = new Array(d).fill(0); for (const v of vs) for (let i = 0; i < d; i++) s[i] += v[i]; return s.map((x) => x / vs.length); };
const f = (x) => x.toFixed(3);

const synths = [];
for (const t of corpus.topics) {
	for (const s of t.synths) {
		const vs = s.paraphrases.map((p) => cache.get(key(p))).filter(Boolean);
		if (vs.length !== 2) continue;
		synths.push({ topic: t.name, name: s.name, vec: centroid(vs) });
	}
}
const themes = [...new Set(synths.map((s) => s.topic))];
console.log(`${synths.length} synths, ${themes.length} themes\n`);

// --- 1. nearest THEME centroid, hold-one-out ---
let correct = 0;
const margins = [];
for (const s of synths) {
	const scored = themes.map((t) => {
		const others = synths.filter((x) => x.topic === t && x.name !== s.name);
		return { t, c: cos(s.vec, centroid(others.map((o) => o.vec))) };
	}).sort((a, b) => b.c - a.c);
	if (scored[0].t === s.topic) correct++;
	const own = scored.find((x) => x.t === s.topic);
	margins.push(own.c - scored.filter((x) => x.t !== s.topic)[0].c);
}
console.log(`1. nearest THEME centroid is correct : ${correct}/${synths.length}`);
const sortedM = [...margins].sort((a, b) => a - b);
console.log(`   margin (own theme - best rival)   : p10 ${f(sortedM[5])}  median ${f(sortedM[25])}  min ${f(sortedM[0])}`);

// --- 2. nearest OTHER SYNTH shares the theme (the pairwise rule) ---
let nnSame = 0;
for (const s of synths) {
	const nn = synths.filter((x) => x.name !== s.name)
		.map((x) => ({ x, c: cos(s.vec, x.vec) }))
		.sort((a, b) => b.c - a.c)[0];
	if (nn.x.topic === s.topic) nnSame++;
}
console.log(`\n2. nearest OTHER synth shares theme  : ${nnSame}/${synths.length}`);

// --- 3. what the greedy pairwise gate can do ---
// The sub-synth spawn band pairs two synths at [clusterThreshold, synthLowerBound).
const same = [], diff = [];
for (let i = 0; i < synths.length; i++)
	for (let j = i + 1; j < synths.length; j++) {
		const c = cos(synths[i].vec, synths[j].vec);
		(synths[i].topic === synths[j].topic ? same : diff).push(c);
	}
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * s.length)]; };
console.log(`\n3. synth-to-synth cosine`);
console.log(`   same theme  (n=${same.length})  p10 ${f(q(same, 0.1))}  med ${f(q(same, 0.5))}  p90 ${f(q(same, 0.9))}`);
console.log(`   diff theme  (n=${diff.length}) p10 ${f(q(diff, 0.1))}  med ${f(q(diff, 0.5))}  p90 ${f(q(diff, 0.9))}`);
let bf = 0, bc = 0, bp = 0, br = 0;
for (let cut = 0.55; cut <= 0.95; cut += 0.005) {
	const tp = same.filter((x) => x >= cut).length, fp = diff.filter((x) => x >= cut).length;
	const p = tp / (tp + fp || 1), r = tp / same.length;
	const s = p + r ? 2 * p * r / (p + r) : 0;
	if (s > bf) { bf = s; bc = cut; bp = p; br = r; }
}
console.log(`   best single pairwise cut ${f(bc)} -> F1 ${f(bf)} (P ${f(bp)} R ${f(br)})  <- ceiling for the greedy rule`);
