// Seeded randomness. mulberry32 is copied verbatim from
// ../2026-09-04-llm-only-baseline/llmBaseline.mjs:114-124 (itself shared with
// scripts/runAccuracyBenchmark.ts) so seeds mean the same thing across studies.
import { hash32 } from './util.mjs';

export function mulberry32(seed) {
	let a = seed >>> 0;

	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Fisher–Yates on a copy (same loop as llmBaseline.mjs:126-135). */
export function seededShuffle(items, seed) {
	const out = [...items];
	const rand = mulberry32(seed);
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}

	return out;
}

/** Deterministic per-cell seed from a fixed base seed and stable labels. */
export const cellSeed = (base, ...parts) => hash32([base, ...parts].join('|'));

const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'; // 32 symbols, no l/o/0/1

/** Opaque ids: "p" + 4 symbols, drawn from a seeded stream; collisions redrawn. */
export function makeOpaqueIds(count, seed) {
	const rand = mulberry32(seed);
	const seen = new Set();
	const ids = [];
	while (ids.length < count) {
		let id = 'p';
		for (let i = 0; i < 4; i++) id += ID_ALPHABET[Math.floor(rand() * ID_ALPHABET.length)];
		if (seen.has(id)) continue;
		seen.add(id);
		ids.push(id);
	}

	return ids;
}
