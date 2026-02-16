/**
 * Shuffle an array using the Fisher-Yates algorithm
 * @param array - The array to shuffle
 * @returns A new shuffled array
 */
export function shuffleArray<T>(array: T[]): T[] {
	// Create a deep copy to ensure we're not mutating the original
	const shuffled = [...array];

	// Fisher-Yates shuffle algorithm
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		// Swap elements
		const temp = shuffled[i];
		shuffled[i] = shuffled[j];
		shuffled[j] = temp;
	}

	return shuffled;
}

/**
 * Get a random sample from an array
 * @param array - The array to sample from
 * @param size - The size of the sample
 * @returns A new array with random samples
 */
export function getRandomSample<T>(array: T[], size: number): T[] {
	// Use Fisher-Yates for proper randomization
	const shuffled = shuffleArray(array);

	return shuffled.slice(0, size);
}
