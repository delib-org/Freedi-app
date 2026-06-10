/**
 * Generates temporal names for anonymous users
 * Format: Adjective Noun 123 (e.g., "Clear Thought 123")
 */

const adjectives = [
	'Clear',
	'Thoughtful',
	'Curious',
	'Insightful',
	'Creative',
	'Analytical',
	'Observant',
	'Mindful',
	'Reflective',
	'Intuitive',
	'Logical',
	'Wise',
	'Bright',
	'Deep',
	'Fair',
	'Open',
	'Sharp',
	'Quick',
	'Keen',
	'Bold',
];

const nouns = [
	'Thought',
	'Mind',
	'Voice',
	'Perspective',
	'View',
	'Insight',
	'Question',
	'Explorer',
	'Thinker',
	'Observer',
	'Analyst',
	'Contributor',
	'Participant',
	'Learner',
	'Seeker',
	'Scholar',
	'Listener',
	'Speaker',
	'Idea',
	'Vision',
];

// Store used names in this session to avoid duplicates
const usedNames = new Set<string>();

/**
 * Generates a unique temporal name for an anonymous user
 * @returns A unique name like "Clear Thought 123"
 */
export function generateTemporalName(): string {
	let attempts = 0;
	let name: string;

	do {
		const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
		const noun = nouns[Math.floor(Math.random() * nouns.length)];
		const number = Math.floor(Math.random() * 999) + 1;
		name = `${adjective} ${noun} ${number}`;
		attempts++;

		// Fallback after too many attempts to avoid infinite loop
		if (attempts > 50) {
			name = `User ${Date.now()}`;
			break;
		}
	} while (usedNames.has(name));

	usedNames.add(name);

	return name;
}

/**
 * Clears the used names set - useful for testing
 */
export function clearUsedNames(): void {
	usedNames.clear();
}

/**
 * Hashes a userId into a non-negative 32-bit integer.
 * Deterministic: the same userId always produces the same hash.
 */
function hashUserId(userId: string): number {
	let hash = 0;
	for (let i = 0; i < userId.length; i++) {
		hash = (hash << 5) - hash + userId.charCodeAt(i);
		hash |= 0; // Convert to 32-bit integer
	}

	return Math.abs(hash);
}

/**
 * Generates a deterministic pseudo-name from a userId.
 * Same userId always produces the same name.
 * @param userId - The user's unique identifier
 * @returns A pseudo-name like "Clear Thought 423"
 */
export function getPseudoName(userId: string): string {
	const hash = hashUserId(userId);

	const adjIdx = hash % adjectives.length;
	const nounIdx = Math.floor(hash / adjectives.length) % nouns.length;
	const number = (hash % 999) + 1;

	return `${adjectives[adjIdx]} ${nouns[nounIdx]} ${number}`;
}

/**
 * Generates a deterministic two-word anonymous display name from a userId.
 * Same userId always produces the same name (e.g., "Wise Explorer").
 * Used to anonymize every user in the main app, regardless of login method.
 * @param userId - The user's unique identifier
 * @returns A two-word pseudonym like "Wise Explorer"
 */
export function getAnonymousName(userId: string): string {
	const hash = hashUserId(userId);

	const adjIdx = hash % adjectives.length;
	const nounIdx = Math.floor(hash / adjectives.length) % nouns.length;

	return `${adjectives[adjIdx]} ${nouns[nounIdx]}`;
}

// Clear used names on page refresh to reset the pool
if (typeof window !== 'undefined') {
	window.addEventListener('beforeunload', () => {
		usedNames.clear();
	});
}
