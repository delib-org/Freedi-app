/** Returns an integer in [0, maxExclusive). */
export type RandomIntFn = (maxExclusive: number) => number;

const UINT32_RANGE = 2 ** 32;

/**
 * Unbiased integer in [0, maxExclusive) from the Web Crypto source. Rejection
 * sampling drops the top slice of the 32-bit range that would make low values
 * slightly more likely under a plain modulo.
 */
export function cryptoRandomInt(maxExclusive: number): number {
	const limit = UINT32_RANGE - (UINT32_RANGE % maxExclusive);
	const buffer = new Uint32Array(1);
	let value: number;
	do {
		crypto.getRandomValues(buffer);
		value = buffer[0];
	} while (value >= limit);

	return value % maxExclusive;
}

/**
 * Fisher–Yates shuffle into a new array, cryptographic source by default.
 * Mirrors `functions/src/privacyExport/shuffle.ts`: export rows read in doc-id
 * order are grouped by person, so they are shuffled before leaving the app.
 */
export function secureShuffle<T>(items: readonly T[], random: RandomIntFn = cryptoRandomInt): T[] {
	const result = [...items];
	for (let i = result.length - 1; i > 0; i--) {
		const j = random(i + 1);
		[result[i], result[j]] = [result[j], result[i]];
	}

	return result;
}
