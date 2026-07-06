/**
 * Era-flavored anonymous code names for agora participants. Names carry the
 * game fiction (time travelers) and never reveal identity.
 */

const WORDS: Record<string, { adjectives: string[]; nouns: string[] }> = {
	he: {
		adjectives: [
			'אמיץ',
			'חכם',
			'שקט',
			'זריז',
			'סקרן',
			'נועז',
			'קשוב',
			'חד',
			'בהיר',
			'עמוק',
		],
		nouns: [
			'פנס',
			'מצפן',
			'שעון',
			'כוכב',
			'גשר',
			'מגדל',
			'נחשול',
			'קול',
			'מסע',
			'מפתח',
		],
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
			'Sharp',
			'Bright',
			'Deep',
		],
		nouns: [
			'Lantern',
			'Compass',
			'Clock',
			'Star',
			'Bridge',
			'Tower',
			'Tide',
			'Voice',
			'Journey',
			'Key',
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
