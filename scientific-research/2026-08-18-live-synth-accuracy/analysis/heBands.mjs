/**
 * Where should the cosine bands sit for HEBREW under text-embedding-3-large?
 *
 * The shipped bands (attach 0.85 / synth 0.78 / cluster 0.60) are calibrated
 * to 3-small geometry — the docstring in types.ts says so explicitly. The
 * per-question migration (Finding 17) moves a Hebrew question to 3-large and
 * keeps the bands, and the live run showed what that does: cross-topic Hebrew
 * cosines run straight through the topic band (a 45-member black-hole theme)
 * and same-topic distinct-idea pairs land in the spawn band (6 false merges).
 *
 * This measures the three distributions that place the bands, on the frozen
 * Hebrew corpus embedded with 3-large @1536 WITH the question-context prefix —
 * the same input shape the pipeline embeds:
 *
 *   twin        — the true paraphrase pair (should merge; wants to be ≥ synthLowerBound)
 *   sameTopic   — same topic, different synth (must NOT merge; spawn-band pollution)
 *   crossTopic  — different topics (must stay below everything)
 *
 * And prints the operating characteristics of candidate thresholds so the
 * bands are chosen from measurements, not vibes.
 *
 *   usage: node heBands.mjs
 *   env:   OPENAI_API_KEY via functions/.env (only if the cache is incomplete)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv } from '../textFidelity.mjs';

const REPO = '/Users/talyaron/Documents/Freedi-app';
const CORPUS = JSON.parse(
	readFileSync(resolve(REPO, 'scripts/seedSynthBenchmark.accuracy100.he.json'), 'utf8'),
);
const CACHE = resolve(REPO, 'scripts/.cache/he-large-embeddings.json');
const MODEL = 'text-embedding-3-large';
const key = (t) => `Question: ${CORPUS.questionText}\nAnswer: ${t}`;

loadEnv();

// ---- load or build the 3-large cache (keyed on the full context input) ----
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const texts = [];
for (const t of CORPUS.topics)
	for (const s of t.synths)
		for (const p of s.paraphrases) texts.push({ topic: t.name, synth: s.name, text: p });

const missing = texts.filter((t) => !cache[key(t.text)]);
if (missing.length) {
	console.log(`embedding ${missing.length} statements with ${MODEL}…`);
	for (let i = 0; i < missing.length; i += 50) {
		const batch = missing.slice(i, i + 50);
		const res = await fetch('https://api.openai.com/v1/embeddings', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
			},
			body: JSON.stringify({
				model: MODEL,
				input: batch.map((t) => key(t.text)),
				dimensions: 1536,
			}),
		});
		if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
		const body = await res.json();
		body.data.forEach((d, j) => {
			cache[key(batch[j].text)] = d.embedding;
		});
	}
	writeFileSync(CACHE, JSON.stringify(cache));
}

// ---- distributions ----
const dot = (a, b) => {
	let d = 0;
	for (let i = 0; i < a.length; i++) d += a[i] * b[i];

	return d;
};
const cos = (a, b) => dot(a, b) / Math.sqrt(dot(a, a) * dot(b, b));
const items = texts.map((t) => ({ ...t, vec: cache[key(t.text)] })).filter((t) => t.vec);
console.log(`${items.length} statements embedded (${MODEL} @1536, with context prefix)`);

const twin = [];
const sameTopic = [];
const crossTopic = [];
for (let i = 0; i < items.length; i++) {
	for (let j = i + 1; j < items.length; j++) {
		const c = cos(items[i].vec, items[j].vec);
		if (items[i].synth === items[j].synth) twin.push(c);
		else if (items[i].topic === items[j].topic) sameTopic.push(c);
		else crossTopic.push(c);
	}
}
const q = (a, p) => {
	const s = [...a].sort((x, y) => x - y);

	return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const f = (x) => x.toFixed(3);
const line = (name, a) =>
	console.log(
		`${name.padEnd(11)} n=${String(a.length).padStart(5)}  min ${f(Math.min(...a))}  p10 ${f(q(a, 0.1))}  med ${f(q(a, 0.5))}  p90 ${f(q(a, 0.9))}  max ${f(Math.max(...a))}`,
	);
line('twin', twin);
line('sameTopic', sameTopic);
line('crossTopic', crossTopic);

// ---- operating characteristics per candidate threshold ----
console.log('\nT      twins>=T   sameTopic>=T   crossTopic>=T');
for (let T = 0.5; T <= 0.92; T += 0.02) {
	const t = twin.filter((c) => c >= T).length;
	const s = sameTopic.filter((c) => c >= T).length;
	const x = crossTopic.filter((c) => c >= T).length;
	console.log(
		`${T.toFixed(2)}   ${String(t).padStart(3)}/${twin.length}      ${String(s).padStart(4)}/${sameTopic.length}       ${String(x).padStart(4)}/${crossTopic.length}`,
	);
}
