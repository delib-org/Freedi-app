import { randomInt } from 'node:crypto';

/** Returns an integer in [0, maxExclusive). */
export type RandomIntFn = (maxExclusive: number) => number;

/**
 * Fisher–Yates shuffle into a new array, with a cryptographic source by default.
 *
 * Why it exists: evaluation doc ids are `${uid}--${statementId}`, so rows read
 * in doc-id order come out grouped by person. Emitting them in that order lets
 * anyone re-link one person's whole ballot from the "anonymized" list.
 * `Math.random` is not used because its output is predictable from a few
 * samples; `crypto.randomInt` is unbiased and unpredictable.
 */
export function secureShuffle<T>(items: readonly T[], random: RandomIntFn = randomInt): T[] {
	const result = [...items];
	for (let i = result.length - 1; i > 0; i--) {
		const j = random(i + 1);
		[result[i], result[j]] = [result[j], result[i]];
	}

	return result;
}
