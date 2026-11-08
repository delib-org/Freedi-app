/**
 * Seeded lottery (mulberry32). A facilitator can re-run the same seed and
 * get the same room, and explain it.
 */
export interface Rng {
	/** Uniform in [0, 1). */
	next(): number;
	/** Uniform integer in [0, bound). */
	int(bound: number): number;
}

export function createRng(seed: number): Rng {
	let state = seed >>> 0;
	const next = (): number => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};

	return { next, int: (bound) => Math.floor(next() * bound) };
}

/** Fisher–Yates, in place, returns the same array. */
export function shuffle<T>(items: T[], rng: Rng): T[] {
	for (let i = items.length - 1; i > 0; i--) {
		const j = rng.int(i + 1);
		[items[i], items[j]] = [items[j], items[i]];
	}

	return items;
}
