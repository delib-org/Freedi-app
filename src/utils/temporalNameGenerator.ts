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

// Clear used names on page refresh to reset the pool
if (typeof window !== 'undefined') {
	window.addEventListener('beforeunload', () => {
		usedNames.clear();
	});
}
