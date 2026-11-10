/**
 * Runs the server's own answer sampler in this process, for the phases that
 * simulate who rates what. Math.random is replaced only while the sampler runs,
 * so a rerun rates the same answers and the two full runs stay comparable.
 */
import type { Statement } from '@freedi/shared-types';
import { selectAnswerBatch } from '../../functions/src/utils/answerBatchSelection';

const SAMPLER_SEED = 0x5ca1e;

function mulberry32(seed: number): () => number {
	let state = seed;

	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

let random = mulberry32(SAMPLER_SEED);

/** Restarts the sequence: one run's answers do not depend on what ran before it. */
export function resetSampler(): void {
	random = mulberry32(SAMPLER_SEED);
}

export function sampleAnswers(
	statements: readonly Statement[],
	ratedIds: Iterable<string>,
	uid: string,
	size: number,
): Statement[] {
	const originalRandom = Math.random;
	Math.random = random;
	try {
		return selectAnswerBatch({ statements, ratedIds, uid, size }).answers;
	} finally {
		Math.random = originalRandom;
	}
}
