import {
	SEARCH_CONFIG,
	type SearchCandidate,
	type SearchMatch,
	type SearchRange,
} from '../models/search/searchModel';

/**
 * Fuzzy text search for statements — dependency-free so the main app and
 * Cloud Functions rank identically.
 *
 * Normalization folds what should not tell two spellings apart: case, Latin
 * diacritics, Hebrew nikkud and cantillation, Arabic tashkeel and tatweel,
 * Hebrew final letters, punctuation. Every normalized character remembers
 * where it came from, so match ranges highlight the original text.
 *
 * Scoring, best first:
 *   whole text equals the query                   1.00
 *   query found at the start of a word            0.95
 *   query found inside a word                     0.85
 *   per query word (averaged, capped at 0.90):
 *     a word starts with it                       0.90
 *     a word contains it                          0.80
 *     one typo (4–5 letters) / two typos (6+)     0.75 / 0.65
 *     letters in order, same first letter         0.60–0.75  ("tlk" → "talk")
 *   each of the above after dropping one Hebrew
 *   prefix letter (ה ו ב ל מ ש כ)                 × 0.95
 */

const SCORE = {
	exact: 1,
	phraseAtWordStart: 0.95,
	phraseInsideWord: 0.85,
	wordPrefix: 0.9,
	wordInside: 0.8,
	typoOne: 0.75,
	typoTwo: 0.65,
	subsequenceBase: 0.6,
	subsequenceSpan: 0.15,
	hebrewPrefixFactor: 0.95,
	multiWordCap: 0.9,
} as const;

/** Typo tolerance starts at this word length; shorter words are too easy to confuse. */
const TYPO_MIN_LENGTH = 4;
/** Words up to this length tolerate one typo, longer ones two. */
const ONE_TYPO_MAX_LENGTH = 5;

const LETTER_OR_DIGIT = new RegExp('[\\p{L}\\p{N}]', 'u');
const COMBINING_MARK = new RegExp('\\p{M}', 'u');
const ARABIC_TATWEEL = 'ـ';

const HEBREW_FINAL_LETTERS: Readonly<Record<string, string>> = {
	ך: 'כ',
	ם: 'מ',
	ן: 'נ',
	ף: 'פ',
	ץ: 'צ',
};

const HEBREW_PREFIX_LETTERS = new Set(['ה', 'ו', 'ב', 'ל', 'מ', 'ש', 'כ']);

export interface NormalizedText {
	text: string;
	/** Original start index of each normalized character. */
	starts: number[];
	/** Original end index (exclusive) of each normalized character. */
	ends: number[];
}

export interface TextMatch {
	score: number;
	ranges: SearchRange[];
}

type NormalizedRange = [number, number];

interface Word {
	value: string;
	offset: number;
}

interface WordHit {
	score: number;
	ranges: NormalizedRange[];
}

/** Normalize and keep, per output character, the span of input it came from. */
export function normalizeWithMap(input: string): NormalizedText {
	const chars: string[] = [];
	const starts: number[] = [];
	const ends: number[] = [];

	const push = (char: string, start: number, end: number): void => {
		chars.push(char);
		starts.push(start);
		ends.push(end);
	};

	let index = 0;
	for (const codePoint of input) {
		const start = index;
		const end = index + codePoint.length;
		index = end;

		for (const piece of codePoint.normalize('NFKD')) {
			if (COMBINING_MARK.test(piece) || piece === ARABIC_TATWEEL) continue;

			for (const lowered of piece.toLowerCase()) {
				const mapped = HEBREW_FINAL_LETTERS[lowered] ?? lowered;
				if (LETTER_OR_DIGIT.test(mapped)) {
					// Push code units so text indices line up with the arrays.
					for (let unit = 0; unit < mapped.length; unit++) push(mapped[unit], start, end);
				} else if (chars.length > 0 && chars[chars.length - 1] !== ' ') {
					push(' ', start, end);
				}
			}
		}
	}

	if (chars[chars.length - 1] === ' ') {
		chars.pop();
		starts.pop();
		ends.pop();
	}

	return { text: chars.join(''), starts, ends };
}

export function normalizeSearchText(input: string): string {
	return normalizeWithMap(input).text;
}

/**
 * Optimal-string-alignment distance (Levenshtein plus adjacent swaps).
 * Returns `max + 1` as soon as the distance is known to exceed `max`.
 */
export function editDistance(a: string, b: string, max: number): number {
	if (Math.abs(a.length - b.length) > max) return max + 1;

	let beforePrevious: number[] = [];
	let previous = Array.from({ length: b.length + 1 }, (_, j) => j);

	for (let i = 1; i <= a.length; i++) {
		const current = [i];
		let rowMin = i;
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			let value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				value = Math.min(value, beforePrevious[j - 2] + 1);
			}
			current[j] = value;
			if (value < rowMin) rowMin = value;
		}
		if (rowMin > max) return max + 1;
		beforePrevious = previous;
		previous = current;
	}

	return previous[b.length];
}

function splitWords(text: string): Word[] {
	const words: Word[] = [];
	let offset = 0;
	for (const value of text.split(' ')) {
		if (value) words.push({ value, offset });
		offset += value.length + 1;
	}

	return words;
}

/** Positions of the query's letters, in order, inside the word — or null. */
function subsequencePositions(query: string, word: string): number[] | null {
	if (query.length < 2 || query[0] !== word[0]) return null;

	const positions: number[] = [];
	let next = 0;
	for (let i = 0; i < word.length && next < query.length; i++) {
		if (word[i] === query[next]) {
			positions.push(i);
			next++;
		}
	}

	return next === query.length ? positions : null;
}

interface Variant {
	query: string;
	word: string;
	offset: number;
	factor: number;
}

function hasHebrewPrefix(value: string): boolean {
	return value.length > 2 && HEBREW_PREFIX_LETTERS.has(value[0]);
}

/** The word and query as typed, plus each with one Hebrew prefix letter dropped. */
function variantsOf(query: string, word: Word): Variant[] {
	const variants: Variant[] = [{ query, word: word.value, offset: word.offset, factor: 1 }];
	const factor = SCORE.hebrewPrefixFactor;
	if (hasHebrewPrefix(word.value)) {
		variants.push({ query, word: word.value.slice(1), offset: word.offset + 1, factor });
	}
	if (hasHebrewPrefix(query)) {
		variants.push({ query: query.slice(1), word: word.value, offset: word.offset, factor });
	}

	return variants;
}

function typoHit({ query, word, offset, factor }: Variant): WordHit | null {
	if (query.length < TYPO_MIN_LENGTH) return null;
	// Keep the first letter (or a swap of the first two) — "walk" is not a typo of "talk".
	if (query[0] !== word[0] && query[1] !== word[0]) return null;

	const max = query.length <= ONE_TYPO_MAX_LENGTH ? 1 : 2;
	const whole = editDistance(query, word, max);
	// As-you-type: compare against the start of a longer word too.
	const prefix =
		word.length > query.length ? editDistance(query, word.slice(0, query.length), max) : max + 1;
	const distance = Math.min(whole, prefix);
	if (distance > max) return null;

	const length = whole <= prefix ? word.length : query.length;

	return {
		score: (distance <= 1 ? SCORE.typoOne : SCORE.typoTwo) * factor,
		ranges: [[offset, offset + length]],
	};
}

function scoreWord(query: string, word: Word): WordHit | null {
	let best: WordHit | null = null;
	const consider = (hit: WordHit | null): void => {
		if (hit && (!best || hit.score > best.score)) best = hit;
	};

	for (const variant of variantsOf(query, word)) {
		const { query: q, word: w, offset, factor } = variant;
		if (!q || !w) continue;

		if (w.startsWith(q)) {
			consider({ score: SCORE.wordPrefix * factor, ranges: [[offset, offset + q.length]] });
		} else if (q.length >= 2) {
			const at = w.indexOf(q);
			if (at > 0) {
				consider({
					score: SCORE.wordInside * factor,
					ranges: [[offset + at, offset + at + q.length]],
				});
			}
		}

		const positions = subsequencePositions(q, w);
		if (positions) {
			consider({
				score: (SCORE.subsequenceBase + SCORE.subsequenceSpan * (q.length / w.length)) * factor,
				ranges: positions.map(
					(position): NormalizedRange => [offset + position, offset + position + 1],
				),
			});
		}

		consider(typoHit(variant));
	}

	return best;
}

/** Map normalized ranges back to the original text, sorted and merged. */
function toOriginalRanges(target: NormalizedText, ranges: NormalizedRange[]): SearchRange[] {
	const mapped = ranges
		.filter(([start, end]) => end > start && start >= 0 && end <= target.text.length)
		.map(([start, end]) => ({ start: target.starts[start], end: target.ends[end - 1] }))
		.sort((a, b) => a.start - b.start);

	const merged: SearchRange[] = [];
	for (const range of mapped) {
		const last = merged[merged.length - 1];
		if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
		else merged.push({ ...range });
	}

	return merged;
}

/** How well `text` matches `query`, 0–1, with the matched spans of `text`. */
export function scoreMatch(query: string, text: string): TextMatch {
	const none: TextMatch = { score: 0, ranges: [] };
	const normalizedQuery = normalizeSearchText(query);
	if (!normalizedQuery || !text) return none;

	const target = normalizeWithMap(text);
	if (!target.text) return none;

	if (target.text === normalizedQuery) {
		return { score: SCORE.exact, ranges: toOriginalRanges(target, [[0, normalizedQuery.length]]) };
	}

	const at = target.text.indexOf(normalizedQuery);
	if (at >= 0) {
		const atWordStart = at === 0 || target.text[at - 1] === ' ';

		return {
			score: atWordStart ? SCORE.phraseAtWordStart : SCORE.phraseInsideWord,
			ranges: toOriginalRanges(target, [[at, at + normalizedQuery.length]]),
		};
	}

	const words = splitWords(target.text);
	const queryWords = normalizedQuery.split(' ');
	let total = 0;
	const ranges: NormalizedRange[] = [];

	for (const queryWord of queryWords) {
		let best: WordHit | null = null;
		for (const word of words) {
			const hit = scoreWord(queryWord, word);
			if (hit && (!best || hit.score > best.score)) best = hit;
		}
		if (best) {
			total += best.score;
			ranges.push(...best.ranges);
		}
	}

	const score = Math.min(SCORE.multiWordCap, total / queryWords.length);

	return score > 0 ? { score, ranges: toOriginalRanges(target, ranges) } : none;
}

export interface RankOptions {
	limit?: number;
	minScore?: number;
}

/**
 * Score every candidate against the query and return the best matches,
 * highest score first, most recently updated first on ties. A candidate is
 * scored on its title and (weighted down) its description; the better one wins.
 */
export function rankCandidates(
	query: string,
	candidates: readonly SearchCandidate[],
	{
		limit = SEARCH_CONFIG.MAX_RESULTS,
		minScore = SEARCH_CONFIG.MIN_LEXICAL_SCORE,
	}: RankOptions = {},
): SearchMatch[] {
	if (normalizeSearchText(query).length < SEARCH_CONFIG.MIN_QUERY_LENGTH) return [];

	const seen = new Set<string>();
	const matches: SearchMatch[] = [];

	for (const candidate of candidates) {
		if (seen.has(candidate.statementId)) continue;
		seen.add(candidate.statementId);

		const title = scoreMatch(query, candidate.title);
		const description = candidate.description ? scoreMatch(query, candidate.description) : null;
		const descriptionScore = description ? description.score * SEARCH_CONFIG.DESCRIPTION_WEIGHT : 0;

		if (title.score >= descriptionScore) {
			if (title.score >= minScore) {
				matches.push({
					candidate,
					score: title.score,
					kind: 'lexical',
					field: 'title',
					ranges: title.ranges,
				});
			}
		} else if (description && descriptionScore >= minScore) {
			matches.push({
				candidate,
				score: descriptionScore,
				kind: 'lexical',
				field: 'description',
				ranges: description.ranges,
			});
		}
	}

	return matches
		.sort((a, b) => b.score - a.score || b.candidate.lastUpdate - a.candidate.lastUpdate)
		.slice(0, limit);
}
