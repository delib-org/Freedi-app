// Vector storage, exact cosine top-k, and a small BM25 for annotation
// screening. Pure; no network.
import { existsSync, readFileSync } from 'node:fs';
import { writeFileAtomic, readJson, writeJson, sha256 } from './util.mjs';

// ---------------------------------------------------------------- vectors

/** Store {id → Float32Array} as <base>.f32 + <base>.json (order, model, text hashes). */
export function saveVectors(base, { model, dimensions, contract, entries }) {
	const buf = Buffer.alloc(entries.length * dimensions * 4);
	entries.forEach((e, row) => {
		if (e.vector.length !== dimensions) throw new Error(`vector ${e.id} has ${e.vector.length} dims`);
		for (let d = 0; d < dimensions; d++) buf.writeFloatLE(e.vector[d], (row * dimensions + d) * 4);
	});
	writeFileAtomic(`${base}.f32`, buf);
	writeJson(`${base}.json`, {
		model,
		dimensions,
		contract,
		f32Sha256: sha256(buf),
		rows: entries.map((e) => ({ id: e.id, textSha256: e.textSha256, tokens: e.tokens ?? null })),
	});
}

export function loadVectors(base) {
	if (!existsSync(`${base}.json`)) return null;
	const meta = readJson(`${base}.json`);
	const buf = readFileSync(`${base}.f32`);
	if (sha256(buf) !== meta.f32Sha256) throw new Error(`${base}.f32 does not match its recorded hash`);
	const map = new Map();
	meta.rows.forEach((r, row) => {
		const v = new Float32Array(meta.dimensions);
		for (let d = 0; d < meta.dimensions; d++) v[d] = buf.readFloatLE((row * meta.dimensions + d) * 4);
		map.set(r.id, v);
	});

	return { meta, map };
}

export function cosine(a, b) {
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

/** Rank every candidate by cosine desc; ties broken by id asc. */
export function rankByCosine(queryVec, candidateIds, vectors) {
	return candidateIds
		.map((id) => {
			const v = vectors.get(id);
			if (!v) throw new Error(`no vector for ${id}`);

			return { id, score: cosine(queryVec, v) };
		})
		.sort((x, y) => y.score - x.score || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

// ---------------------------------------------------------------- BM25

const STOP = new Set(
	'a an the and or but of to in on for with at by from as is are was were be been being it its this that these those we our us you your they their them he she his her i me my not no do does did have has had will would should could can may might must more most less very so than too also there here what which who whom how why when where all any some such into out up down over under again further then once just only own same other each few both per via bowling green warren county bg city town people'.split(
		' ',
	),
);

export const tokenize = (s) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.split(' ')
		.filter((t) => t.length > 1 && !STOP.has(t));

export function buildBm25(docs, { k1 = 1.2, b = 0.75 } = {}) {
	const toks = docs.map((d) => tokenize(d.text));
	const avgdl = toks.reduce((a, t) => a + t.length, 0) / Math.max(1, toks.length);
	const df = new Map();
	for (const t of toks) for (const w of new Set(t)) df.set(w, (df.get(w) ?? 0) + 1);
	const N = docs.length;
	const idf = (w) => Math.log(1 + (N - (df.get(w) ?? 0) + 0.5) / ((df.get(w) ?? 0) + 0.5));

	return function score(queryText) {
		const q = [...new Set(tokenize(queryText))];

		return docs
			.map((d, i) => {
				const t = toks[i];
				let s = 0;
				for (const w of q) {
					const f = t.filter((x) => x === w).length;
					if (!f) continue;
					s += idf(w) * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * t.length) / avgdl)));
				}

				return { id: d.id, score: s };
			})
			.sort((x, y) => y.score - x.score || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
	};
}
