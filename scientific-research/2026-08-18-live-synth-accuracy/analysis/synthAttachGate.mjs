/**
 * Offline: where should the SYNTH-ATTACH cohesion floor sit?
 *
 * Pass 1 attaches a newcomer to an existing synth on bestSimilarity (a MAX) and
 * then asks a cohesion gate for permission. The gate has never once refused in a
 * 100-statement run, so it is worth knowing what it would take to make it bite.
 *
 * On this corpus every ground-truth synth has exactly 2 members, so:
 *   GENUINE 3rd member  -> does not exist; the best proxy for "a paraphrase
 *                          joining a set of paraphrases" is the within-pair
 *                          cosine itself (centroid of a 1-member set).
 *   FALSE   3rd member  -> every other statement's cosine to the pair centroid.
 *
 * Reports the separation and what each candidate floor costs.
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
	const rec = JSON.parse(line);
	cache.set(rec.key, rec.vector);
}
const key = (t) => `Question: ${corpus.questionText}\nAnswer: ${t}`;

const pairs = []; // {topic, synth, vecs:[a,b]}
const all = [];
for (const t of corpus.topics) {
	for (const s of t.synths) {
		const vs = s.paraphrases.map((p) => cache.get(key(p))).filter(Boolean);
		if (vs.length !== 2) { console.error('missing', s.name); continue; }
		pairs.push({ topic: t.name, synth: s.name, vecs: vs });
		vs.forEach((v) => all.push({ topic: t.name, synth: s.name, vec: v }));
	}
}

const dot = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += a[i] * b[i]; return d; };
const cos = (a, b) => dot(a, b) / Math.sqrt(dot(a, a) * dot(b, b));
const centroid = (vs) => { const d = vs[0].length, s = new Array(d).fill(0); for (const v of vs) for (let i = 0; i < d; i++) s[i] += v[i]; return s.map((x) => x / vs.length); };
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const f = (x) => x.toFixed(3);

// GENUINE proxy: within-pair cosine (a paraphrase joining its partner).
const genuine = pairs.map((p) => cos(p.vecs[0], p.vecs[1]));

// FALSE: every non-member's cosine to the 2-member synth centroid.
const falseSameTopic = [], falseCrossTopic = [];
for (const p of pairs) {
	const c = centroid(p.vecs);
	for (const s of all) {
		if (s.synth === p.synth) continue;
		const v = cos(s.vec, c);
		(s.topic === p.topic ? falseSameTopic : falseCrossTopic).push(v);
	}
}
const allFalse = [...falseSameTopic, ...falseCrossTopic];

console.log(`pairs ${pairs.length}, false candidates ${allFalse.length}\n`);
console.log(`GENUINE (within-pair)      min ${f(Math.min(...genuine))}  p10 ${f(q(genuine, 0.1))}  med ${f(q(genuine, 0.5))}`);
console.log(`FALSE same-topic           med ${f(q(falseSameTopic, 0.5))}  p90 ${f(q(falseSameTopic, 0.9))}  p99 ${f(q(falseSameTopic, 0.99))}  max ${f(Math.max(...falseSameTopic))}`);
console.log(`FALSE cross-topic          med ${f(q(falseCrossTopic, 0.5))}  p99 ${f(q(falseCrossTopic, 0.99))}  max ${f(Math.max(...falseCrossTopic))}`);

console.log('\nfloor   genuine kept   false admitted (of ' + allFalse.length + ')');
for (const floor of [0.78, 0.80, 0.82, 0.84, 0.85, 0.86, 0.87, 0.88]) {
	const kept = genuine.filter((x) => x >= floor).length;
	const admitted = allFalse.filter((x) => x >= floor).length;
	console.log(`${f(floor)}   ${kept}/${genuine.length}          ${admitted}`);
}
