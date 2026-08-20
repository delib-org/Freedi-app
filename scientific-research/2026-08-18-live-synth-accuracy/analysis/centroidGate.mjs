/**
 * Offline: can a CENTROID-RELATIVE gate separate on-theme from off-theme,
 * where an absolute pairwise cosine cut provably cannot?
 *
 * Uses the preflight embedding cache (no API calls).
 *
 *   usage: node centroidGate.mjs <corpus.json>
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = '/Users/talyaron/Documents/Freedi-app';
const corpusPath = resolve(REPO, process.argv[2] ?? 'scripts/seedSynthBenchmark.accuracy100.en.json');
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));

// load cache
const cache = new Map();
for (const line of readFileSync(resolve(REPO, 'scripts/.cache/preflight-embeddings.jsonl'), 'utf8').split('\n')) {
	if (!line.trim()) continue;
	const rec = JSON.parse(line);
	cache.set(rec.key, rec.vector);
}

const key = (text) => `Question: ${corpus.questionText}\nAnswer: ${text}`;

// flatten: topics -> synths -> statements
const items = []; // {topic, synth, text, vec}
for (const t of corpus.topics) {
	for (const s of t.synths ?? []) {
		for (const st of s.paraphrases ?? []) {
			const text = typeof st === 'string' ? st : st.statement ?? st.text;
			const v = cache.get(key(text));
			if (!v) { console.error('MISS', text.slice(0, 60)); continue; }
			items.push({ topic: t.name, synth: s.name, text, vec: v });
		}
	}
}
console.log(`loaded ${items.length} statements, ${new Set(items.map(i => i.topic)).size} topics`);

const dot = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += a[i] * b[i]; return d; };
const norm = (a) => Math.sqrt(dot(a, a));
const cos = (a, b) => dot(a, b) / (norm(a) * norm(b));
const centroid = (vs) => { const d = vs[0].length, s = new Array(d).fill(0); for (const v of vs) for (let i = 0; i < d; i++) s[i] += v[i]; return s.map(x => x / vs.length); };
const q = (arr, p) => { const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const fmt = (x) => x.toFixed(3);

const topics = [...new Set(items.map(i => i.topic))];

// ---------------------------------------------------------------
// Experiment: for each topic, hold out one member; build centroid of the
// remaining k members; measure held-out member's centroid cosine (ON) and
// every off-topic statement's centroid cosine (OFF). Report the ratio
// against the cluster's own mean member-to-centroid cosine.
// ---------------------------------------------------------------
for (const clusterSize of [3, 5, 10]) {
	const onAbs = [], offAbs = [], onRatio = [], offRatio = [];
	for (const t of topics) {
		const mem = items.filter(i => i.topic === t);
		const off = items.filter(i => i.topic !== t);
		for (let h = 0; h < mem.length; h++) {
			const rest = mem.filter((_, i) => i !== h).slice(0, clusterSize);
			if (rest.length < 2) continue;
			const c = centroid(rest.map(r => r.vec));
			const selfCoh = rest.map(r => cos(r.vec, c));
			const meanSelf = selfCoh.reduce((a, b) => a + b, 0) / selfCoh.length;
			const on = cos(mem[h].vec, c);
			onAbs.push(on); onRatio.push(on / meanSelf);
			// sample off-topic members (every 7th to keep it fast)
			for (let j = 0; j < off.length; j += 7) {
				const o = cos(off[j].vec, c);
				offAbs.push(o); offRatio.push(o / meanSelf);
			}
		}
	}
	// best cut + F1 for both signals
	const best = (onArr, offArr) => {
		const cuts = [...new Set([...onArr, ...offArr].map(x => Math.round(x * 1000) / 1000))].sort((a, b) => a - b);
		let bf = 0, bc = 0, bp = 0, br = 0;
		for (const cut of cuts) {
			const tp = onArr.filter(x => x >= cut).length;
			const fp = offArr.filter(x => x >= cut).length;
			const fn = onArr.length - tp;
			const p = tp / (tp + fp || 1), r = tp / (tp + fn || 1);
			const f = p + r ? 2 * p * r / (p + r) : 0;
			if (f > bf) { bf = f; bc = cut; bp = p; br = r; }
		}
		return { f1: bf, cut: bc, p: bp, r: br };
	};
	const a = best(onAbs, offAbs), rr = best(onRatio, offRatio);
	console.log(`\n=== cluster size ${clusterSize} (on=${onAbs.length}, off=${offAbs.length}) ===`);
	console.log(`ABSOLUTE centroid cosine   on p10=${fmt(q(onAbs, 0.1))} med=${fmt(q(onAbs, 0.5))} | off med=${fmt(q(offAbs, 0.5))} p90=${fmt(q(offAbs, 0.9))}`);
	console.log(`   best cut ${fmt(a.cut)} -> F1 ${fmt(a.f1)} (P ${fmt(a.p)} R ${fmt(a.r)})`);
	console.log(`RELATIVE centroid ratio    on p10=${fmt(q(onRatio, 0.1))} med=${fmt(q(onRatio, 0.5))} | off med=${fmt(q(offRatio, 0.5))} p90=${fmt(q(offRatio, 0.9))}`);
	console.log(`   best cut ${fmt(rr.cut)} -> F1 ${fmt(rr.f1)} (P ${fmt(rr.p)} R ${fmt(rr.r)})`);
}
