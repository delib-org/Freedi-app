import {
	editDistance,
	normalizeSearchText,
	normalizeWithMap,
	rankCandidates,
	scoreMatch,
} from '../textSearch';
import { SEARCH_CONFIG, type SearchCandidate } from '../../models/search/searchModel';
import { StatementType } from '../../models/TypeEnums';

function candidate(
	statementId: string,
	title: string,
	extra: Partial<SearchCandidate> = {},
): SearchCandidate {
	return {
		statementId,
		title,
		statementType: StatementType.question,
		parentId: 'top',
		topParentId: statementId,
		lastUpdate: 1,
		...extra,
	};
}

function highlighted(text: string, query: string): string[] {
	return scoreMatch(query, text).ranges.map(({ start, end }) => text.slice(start, end));
}

describe('normalizeSearchText', () => {
	it('lowercases and collapses punctuation and whitespace', () => {
		expect(normalizeSearchText('  Hello,   World!! ')).toBe('hello world');
	});

	it('strips Latin diacritics', () => {
		expect(normalizeSearchText('Café Über')).toBe('cafe uber');
	});

	it('strips Hebrew nikkud and folds final letters', () => {
		expect(normalizeSearchText('שָׁלוֹם')).toBe('שלומ');
		expect(normalizeSearchText('שלום')).toBe('שלומ');
		expect(normalizeSearchText('ארץ')).toBe('ארצ');
	});

	it('strips Arabic tashkeel and tatweel', () => {
		expect(normalizeSearchText('مَرْحَبًا')).toBe(normalizeSearchText('مرحبا'));
		expect(normalizeSearchText('مـرحبا')).toBe(normalizeSearchText('مرحبا'));
	});

	it('returns an empty string for punctuation only', () => {
		expect(normalizeSearchText('?!…')).toBe('');
	});

	it('maps every normalized character back to the original text', () => {
		const original = 'שָׁלוֹם עולם';
		const { text, starts, ends } = normalizeWithMap(original);
		expect(starts).toHaveLength(text.length);
		expect(ends).toHaveLength(text.length);
		expect(original.slice(starts[0], ends[3])).toBe('שָׁלוֹם');
	});
});

describe('editDistance', () => {
	it('counts an adjacent swap as one edit', () => {
		expect(editDistance('taks', 'task', 2)).toBe(1);
	});

	it('stops early past the maximum', () => {
		expect(editDistance('abcdef', 'uvwxyz', 1)).toBe(2);
		expect(editDistance('a', 'abcd', 1)).toBe(2);
	});
});

describe('scoreMatch', () => {
	it('finds "Talk" when typed "tlk"', () => {
		const match = scoreMatch('tlk', 'Talk about the budget');
		expect(match.score).toBeGreaterThanOrEqual(SEARCH_CONFIG.MIN_LEXICAL_SCORE);
		expect(highlighted('Talk about the budget', 'tlk').join('')).toBe('Tlk');
	});

	it('tolerates a swapped pair of letters', () => {
		expect(scoreMatch('taks', 'Weekly tasks').score).toBeGreaterThanOrEqual(
			SEARCH_CONFIG.MIN_LEXICAL_SCORE,
		);
	});

	it('does not treat a different first letter as a typo', () => {
		expect(scoreMatch('walk', 'talk').score).toBeLessThan(SEARCH_CONFIG.MIN_LEXICAL_SCORE);
	});

	it('ranks exact > word start > inside a word', () => {
		const exact = scoreMatch('park', 'Park').score;
		const wordStart = scoreMatch('park', 'City park plan').score;
		const inside = scoreMatch('park', 'Skatepark').score;
		expect(exact).toBeGreaterThan(wordStart);
		expect(wordStart).toBeGreaterThan(inside);
	});

	it('matches Hebrew with and without nikkud, and final letters mid-typing', () => {
		expect(scoreMatch('שלום', 'שָׁלוֹם לכולם').score).toBeGreaterThanOrEqual(0.9);
		expect(scoreMatch('שלומ', 'שלום').score).toBe(1);
		expect(highlighted('שָׁלוֹם לכולם', 'שלום')).toEqual(['שָׁלוֹם']);
	});

	it('matches a Hebrew word behind a prefix letter', () => {
		expect(scoreMatch('דיון', 'הדיון על התקציב').score).toBeGreaterThanOrEqual(
			SEARCH_CONFIG.MIN_LEXICAL_SCORE,
		);
		expect(scoreMatch('והתקציב', 'התקציב השנתי').score).toBeGreaterThanOrEqual(
			SEARCH_CONFIG.MIN_LEXICAL_SCORE,
		);
	});

	it('matches Arabic regardless of diacritics', () => {
		expect(scoreMatch('مرحبا', 'مَرْحَبًا بالجميع').score).toBeGreaterThanOrEqual(0.9);
	});

	it('averages multi-word queries and penalizes missing words', () => {
		const both = scoreMatch('budget park', 'The park budget').score;
		const one = scoreMatch('budget zebra', 'The park budget').score;
		expect(both).toBeGreaterThan(one);
		expect(both).toBeLessThanOrEqual(0.9);
	});

	it('returns nothing for an empty query or text', () => {
		expect(scoreMatch('', 'text')).toEqual({ score: 0, ranges: [] });
		expect(scoreMatch('text', '')).toEqual({ score: 0, ranges: [] });
	});
});

describe('rankCandidates', () => {
	const items = [
		candidate('a', 'Skatepark renovation', { lastUpdate: 5 }),
		candidate('b', 'Park', { lastUpdate: 1 }),
		candidate('c', 'City park plan', { lastUpdate: 3 }),
		candidate('d', 'Unrelated', { description: 'something about a park', lastUpdate: 9 }),
		candidate('e', 'Nothing here', { lastUpdate: 10 }),
	];

	it('orders by score and drops non-matches', () => {
		const ids = rankCandidates('park', items).map((match) => match.candidate.statementId);
		expect(ids).toEqual(['b', 'c', 'a', 'd']);
	});

	it('weights description matches below title matches and says which field matched', () => {
		const match = rankCandidates('park', items).find((m) => m.candidate.statementId === 'd');
		expect(match?.field).toBe('description');
		expect(match?.score).toBeCloseTo(0.95 * SEARCH_CONFIG.DESCRIPTION_WEIGHT);
	});

	it('breaks ties by most recent update', () => {
		const ties = [
			candidate('old', 'Park', { lastUpdate: 1 }),
			candidate('new', 'Park', { lastUpdate: 2 }),
		];
		expect(rankCandidates('park', ties).map((m) => m.candidate.statementId)).toEqual([
			'new',
			'old',
		]);
	});

	it('ignores queries shorter than the minimum', () => {
		expect(rankCandidates('p', items)).toEqual([]);
		expect(rankCandidates(' !', items)).toEqual([]);
	});

	it('respects the limit and skips duplicate ids', () => {
		const duplicated = [...items, candidate('b', 'Park again')];
		const matches = rankCandidates('park', duplicated, { limit: 2 });
		expect(matches).toHaveLength(2);
		expect(new Set(matches.map((m) => m.candidate.statementId)).size).toBe(2);
	});

	it('marks every match as lexical', () => {
		expect(rankCandidates('park', items).every((m) => m.kind === 'lexical')).toBe(true);
	});
});
