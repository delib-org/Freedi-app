import type { OdysseyElder } from '@freedi/shared-types';

/**
 * Choosing the crew: how many sailors, and in what order they are offered.
 *
 * The sailors are the conscience of the game — they are there to help the
 * player make more conscious choices, not to make them. So the whole roster
 * is offered, nobody is pre-selected, and the player picks a crew of their
 * own. A tester who was handed three felt the choice had been made for him.
 */

/** Fewer than two voices is a monologue, not a council. */
export const CREW_MIN = 2;
/** More than five and the consult panel on an island is a wall of faces. */
export const CREW_MAX = 5;

export interface CrewLimits {
	min: number;
	max: number;
}

/**
 * The limits for a game with `elderCount` sailors on offer. A game that
 * authored fewer than CREW_MIN sailors cannot demand more than it has.
 */
export function crewLimits(elderCount: number): CrewLimits {
	const available = Math.max(0, elderCount);

	return {
		min: Math.min(CREW_MIN, available),
		max: Math.min(CREW_MAX, available),
	};
}

export function crewIsComplete(chosenCount: number, elderCount: number): boolean {
	const { min } = crewLimits(elderCount);

	return min > 0 && chosenCount >= min;
}

export function crewIsFull(chosenCount: number, elderCount: number): boolean {
	return chosenCount >= crewLimits(elderCount).max;
}

export interface RankedElder {
	elder: OdysseyElder;
	/** true when the sailor echoes a ranked value or a wind chip the player picked */
	matchesWinds: boolean;
	/** the player's wind chips (canonical Hebrew) this sailor echoes, in the player's order */
	echoedChips: string[];
}

/** Labels shorter than this match only exactly — "רוח" must not match "רוחב". */
const MIN_PARTIAL_MATCH = 3;

/** A chip echoed in a sailor's declared values — the strongest sign that it is their cause. */
export const CHIP_IN_VALUES_WEIGHT = 6;
/** A chip echoed only in the sailor's needs, role or biography. */
export const CHIP_IN_TEXT_WEIGHT = 4;

/**
 * Chips whose Hebrew words rarely appear verbatim in a biography: the other
 * words a sailor's text would use for the same people. A chip not listed is
 * searched as it is written. Keys are the canonical chips of the default
 * compass; "נשים" already finds "לנשים", the table adds "אישה", "נשות".
 */
export const CHIP_KEYWORDS: Record<string, string[]> = {
	נשים: ['נשים', 'אישה', 'נשות', 'נערות'],
	צעירים: ['צעירים', 'נוער'],
	עולים: ['עולים', 'עלייה', 'עליה', 'מהגרים'],
	חרדים: ['חרדים', 'חרדי'],
	חילונים: ['חילונים', 'חילוני'],
	'ערבים אזרחי ישראל': ['ערבים', 'ערביות', 'ערביים', 'מיעוטים', 'מיעוט'],
	'משפחות חטופים': ['חטופים', 'חטוף'],
	מילואימניקים: ['מילואים', 'מילואימניקים', 'לוחמים'],
	'אנשים בעוני': ['עוני', 'עניים', 'נזקקים'],
	'תושבי הצפון': ['הצפון', 'הגליל'],
	'תושבי הדרום': ['הדרום', 'הנגב'],
	'עברית ותרבות': ['עברית', 'תרבות'],
	'חיים משותפים': ['חיים משותפים', 'שותפות', 'דו-קיום'],
	'ערבות הדדית': ['ערבות', 'סולידריות'],
	'יכולת תיקון': ['תיקון'],
	'טבע ונוף': ['טבע', 'נוף', 'אדמה'],
	'קרע פנימי': ['קרע', 'פילוג', 'שסע'],
	'אובדן דמוקרטיה': ['דמוקרטיה'],
	'אובדן זהות': ['זהות'],
	'יוקר מחיה': ['יוקר', 'מחיה'],
	'בידוד בינלאומי': ['בידוד'],
	'אי-שוויון': ['שוויון'],
	'עתיד הילדים': ['ילדים'],
};

function labelsMatch(a: string, b: string): boolean {
	const left = a.trim();
	const right = b.trim();
	if (!left || !right) return false;
	if (left === right) return true;
	if (left.length < MIN_PARTIAL_MATCH || right.length < MIN_PARTIAL_MATCH) return false;

	return left.includes(right) || right.includes(left);
}

function keywordsOf(chip: string): string[] {
	const listed = CHIP_KEYWORDS[chip];

	return (listed ?? [chip]).filter((word) => word.length >= MIN_PARTIAL_MATCH);
}

/** One or two Hebrew prefix letters (ו ה ל ב מ ש כ) may glue onto a word: "לנשים", "והאישה". */
const HEBREW_PREFIXES = '\\u05D5\\u05D4\\u05DC\\u05D1\\u05DE\\u05E9\\u05DB';
const HEBREW_LETTER = '\\u05D0-\\u05EA';

function wholeWordPattern(keyword: string): RegExp {
	const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

	return new RegExp(
		`(?:^|[^${HEBREW_LETTER}])[${HEBREW_PREFIXES}]{0,2}${escaped}(?![${HEBREW_LETTER}])`,
	);
}

/**
 * Whole-word match, so "לבנות" (to build) is not "בנות" (girls), "מצפון"
 * (conscience) is not "צפון", "מערבי" is not "ערבי", "אנשים" is not "נשים".
 * Keywords must therefore never be words that a prefix letter turns into
 * another common word.
 */
function containsAny(text: string, keywords: string[]): boolean {
	return keywords.some((word) => wholeWordPattern(word).test(text));
}

/** How strongly one chip echoes one sailor: 0, CHIP_IN_TEXT_WEIGHT or CHIP_IN_VALUES_WEIGHT. */
function chipScore(elder: OdysseyElder, chip: string): number {
	const keywords = keywordsOf(chip);
	if (keywords.length === 0) return 0;
	const valuesText = elder.values.map((value) => `${value.label} ${value.description}`).join(' ');
	if (containsAny(valuesText, keywords)) return CHIP_IN_VALUES_WEIGHT;
	const otherText = [elder.role, elder.bio, ...elder.needs].join(' ');

	return containsAny(otherText, keywords) ? CHIP_IN_TEXT_WEIGHT : 0;
}

/**
 * The roster, ordered by closeness to the player's compass.
 *
 * Ordering is not choosing: every sailor is still offered and none is
 * ticked. Two signals float a sailor up, and are summed:
 *
 * 1. Ranked values (רוח ההכרעה): each of the sailor's declared values that
 *    echoes a value the player ranked adds `rankedCount - rank` (the better
 *    the echo, the more). Compared by label — exactly or as a contained word,
 *    so "כבוד" meets "כבוד האדם".
 * 2. Wind chips (רוח האהבה / הדאגה / ההקשבה): each chip the player ticked adds
 *    CHIP_IN_VALUES_WEIGHT if the chip's words (see CHIP_KEYWORDS) appear in
 *    the sailor's declared values, else CHIP_IN_TEXT_WEIGHT if they appear in
 *    the sailor's needs, role or bio, else nothing. A chip counts once per
 *    sailor. Chips must be the canonical Hebrew ones, like the elders.
 *
 * Sailors with a score above zero are flagged and carry the chips they echo
 * so the screen can say why. Ties keep the organizer's order. The free-text
 * answers are not matched: a sentence has no reliable key to a biography.
 */
export function rankEldersByWinds(
	elders: OdysseyElder[],
	rankedValueLabels: string[],
	windChips: string[] = [],
): RankedElder[] {
	const chips = [...new Set(windChips.map((chip) => chip.trim()).filter(Boolean))];
	const scored = elders.map((elder, index) => {
		let score = 0;
		for (const value of elder.values) {
			const rank = rankedValueLabels.findIndex((label) => labelsMatch(label, value.label));
			if (rank !== -1) score += rankedValueLabels.length - rank;
		}
		const echoedChips: string[] = [];
		for (const chip of chips) {
			const weight = chipScore(elder, chip);
			if (weight > 0) {
				score += weight;
				echoedChips.push(chip);
			}
		}

		return { elder, score, index, echoedChips };
	});

	return scored
		.sort((a, b) => b.score - a.score || a.index - b.index)
		.map(({ elder, score, echoedChips }) => ({ elder, matchesWinds: score > 0, echoedChips }));
}

/**
 * The same roster, carrying the elders the screen should SHOW.
 *
 * Ranking matches labels, and labels are matched in Hebrew — the canonical
 * content — while an English or Arabic reader must see their own copy. So a
 * page ranks the canonical elders and then swaps each one, by id, for its
 * localized twin. An elder with no twin (never happens for one game, but the
 * screen must not vanish if it does) keeps the one it was ranked with.
 */
export function withDisplayElders(
	roster: RankedElder[],
	displayElders: OdysseyElder[],
): RankedElder[] {
	if (displayElders.length === 0) return roster;
	const byId = new Map(displayElders.map((elder) => [elder.elderId, elder]));

	return roster.map((ranked) => ({
		...ranked,
		elder: byId.get(ranked.elder.elderId) ?? ranked.elder,
	}));
}
