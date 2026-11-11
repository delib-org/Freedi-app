import { createRng } from '../rng';
import type { Participant, Topic } from '../types';

export const POSITION_STOPS: readonly number[] = [0, 25, 50, 75, 100];
const RANKED_PICKS = 3;
const SEED_MULTIPLIER = 7919;
const CONTINUOUS_STEPS = 1000;
const POSITION_MAX = 100;

export interface CrowdSpec {
	n: number;
	topics: readonly Topic[];
	/** Share (0..1) who declared no position. */
	undeclared: number;
	/** Share (0..1) who ranked no topic. */
	noPreference: number;
	seed: number;
	/** Positions anywhere on 0..100 instead of the five stops. */
	continuous?: boolean;
}

export function makeTopics(count: number): Topic[] {
	return Array.from({ length: count }, (_, i) => ({ id: `t${i}` }));
}

/** A reproducible crowd: positions on the five stops (or continuous), random three-topic rankings. */
export function makeCrowd(spec: CrowdSpec): Participant[] {
	const rng = createRng(spec.seed * SEED_MULTIPLIER + spec.n);

	return Array.from({ length: spec.n }, (_, i) => {
		const position = spec.continuous
			? Math.round(rng.next() * CONTINUOUS_STEPS) / (CONTINUOUS_STEPS / POSITION_MAX)
			: POSITION_STOPS[rng.int(POSITION_STOPS.length)];
		const declared = rng.next() >= spec.undeclared;
		const preferences: string[] = [];
		if (rng.next() >= spec.noPreference) {
			const pool = spec.topics.map((topic) => topic.id);
			for (let k = 0; k < RANKED_PICKS && pool.length > 0; k++) {
				preferences.push(pool.splice(rng.int(pool.length), 1)[0]);
			}
		}

		return { id: `p${i}`, side: declared ? [position] : undefined, preferences };
	});
}
