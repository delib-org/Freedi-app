/**
 * Anonymous animal code names for agora participants. Names never reveal
 * identity. Every animal is one a student would be glad to be called — no
 * animal that doubles as an insult (donkey, ape, pig, cow, snake, dog…).
 * Hebrew nouns are all grammatically masculine so the adjectives agree.
 */

const WORDS: Record<string, { adjectives: string[]; nouns: string[] }> = {
	he: {
		adjectives: ['אמיץ', 'חכם', 'שקט', 'זריז', 'סקרן', 'נועז', 'קשוב', 'עליז', 'נדיב', 'חרוץ'],
		nouns: ['אריה', 'נשר', 'צבי', 'דולפין', 'ינשוף', 'סוס', 'פיל', 'דב', 'אייל', 'נמר'],
	},
	en: {
		adjectives: [
			'Brave',
			'Wise',
			'Quiet',
			'Swift',
			'Curious',
			'Bold',
			'Keen',
			'Cheerful',
			'Kind',
			'Diligent',
		],
		nouns: [
			'Lion',
			'Eagle',
			'Gazelle',
			'Dolphin',
			'Owl',
			'Horse',
			'Elephant',
			'Bear',
			'Stag',
			'Leopard',
		],
	},
};

/**
 * Deterministic name from a participant index (stable per join order) with
 * a numeric suffix once the combination space wraps.
 */
export function generateAnonName(language: string, participantIndex: number): string {
	const words = WORDS[language] ?? WORDS.en;
	const combos = words.adjectives.length * words.nouns.length;
	const slot = participantIndex % combos;
	const adjective = words.adjectives[slot % words.adjectives.length];
	const noun = words.nouns[Math.floor(slot / words.adjectives.length) % words.nouns.length];
	const suffix = participantIndex >= combos ? ` ${Math.floor(participantIndex / combos) + 1}` : '';

	return language === 'he' ? `${noun} ${adjective}${suffix}` : `${adjective} ${noun}${suffix}`;
}
