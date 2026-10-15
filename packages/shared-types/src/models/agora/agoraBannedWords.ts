import { array, number, object, string, InferOutput } from 'valibot';

/**
 * A teacher's list of words their students may not use.
 *
 * One doc per teacher, keyed by their uid, so the list follows them into
 * every class they run. It is written by `agoraSetBannedWords` alone and read
 * by its owner (the editor) and by the language gate on the server. A student
 * never reads it: the gate answers with the ONE word of their own text that
 * matched, not with the list.
 */
export const AGORA_BANNED_WORDS = {
	/** Entries one teacher may keep */
	MAX_WORDS: 200,
	/** Characters in one entry (a word, or a short phrase) */
	MAX_WORD_LENGTH: 40,
	/** A Hebrew word shorter than this is never matched through a prefix (see `findBannedWord`) */
	MIN_PREFIXED_LENGTH: 3,
	/** One-letter Hebrew prefixes stacked in front of a word: "ושהמילה" */
	MAX_PREFIX_LETTERS: 3,
} as const;

export const AgoraTeacherBannedWordsSchema = object({
	/** Doc id — the teacher's uid */
	teacherId: string(),
	words: array(string()),
	lastUpdate: number(),
});

export type AgoraTeacherBannedWords = InferOutput<typeof AgoraTeacherBannedWordsSchema>;

/** ו ה ב ל מ ש כ — the one-letter words Hebrew glues onto the next word */
const HEBREW_PREFIXES: ReadonlySet<string> = new Set(['ו', 'ה', 'ב', 'ל', 'מ', 'ש', 'כ']);
const HEBREW_LETTER = /[א-ת]/;
/** Niqqud, cantillation and the Hebrew points (U+0591–U+05C7), plus invisible format marks */
const POINTS_AND_MARKS = /[֑-ׇ​-‏‪-‮⁦-⁩]/g;
/** Apostrophes, geresh and gershayim: they join a word, they do not split it */
const JOINERS = /['’‘`´׳״"״]/g;
const NOT_WORD = /[^\p{L}\p{N}]+/gu;

/**
 * Words of a text, lower-cased, without niqqud or punctuation.
 *
 * "Ignore niqqud/punctuation" means both sides of a comparison are reduced the
 * same way: points and marks are dropped, apostrophes and gershayim are
 * dropped (so ג'ינג'י and ג׳ינג׳י are one word), every other non-letter splits
 * words, and case is folded.
 */
export function bannedWordTokens(text: string): string[] {
	return text
		.normalize('NFKC')
		.replace(POINTS_AND_MARKS, '')
		.replace(JOINERS, '')
		.toLowerCase()
		.replace(NOT_WORD, ' ')
		.trim()
		.split(' ')
		.filter((token) => token.length > 0);
}

/** The key an entry is deduplicated by: its tokens, space-joined */
export function bannedWordKey(entry: string): string {
	return bannedWordTokens(entry).join(' ');
}

/**
 * Clean a teacher's list for storing: trimmed, entries that reduce to nothing
 * dropped, duplicates (by key) dropped, long entries and long lists capped.
 * The entry keeps the teacher's own spelling — it is what they see again.
 */
export function cleanBannedWords(entries: readonly string[]): string[] {
	const seen = new Set<string>();
	const clean: string[] = [];
	for (const entry of entries) {
		const trimmed = entry.trim().slice(0, AGORA_BANNED_WORDS.MAX_WORD_LENGTH);
		const key = bannedWordKey(trimmed);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		clean.push(trimmed);
		if (clean.length >= AGORA_BANNED_WORDS.MAX_WORDS) break;
	}

	return clean;
}

/**
 * Does `token` say `word`, possibly with Hebrew one-letter prefixes in front?
 *
 * Prefix rule, chosen to catch "והמטומטם" / "בטמבל" without turning the list
 * into a minefield: up to three of ו ה ב ל מ ש כ may precede the word, and only
 * when the word itself is Hebrew and at least three letters (a two-letter
 * entry like "בן" would otherwise hit "לבן", white). Suffixes (plurals,
 * possessives) are NOT matched — the teacher lists the forms they mean.
 */
function tokenSaysWord(token: string, word: string): boolean {
	if (token === word) return true;
	if (word.length < AGORA_BANNED_WORDS.MIN_PREFIXED_LENGTH) return false;
	if (!HEBREW_LETTER.test(word[0])) return false;
	let rest = token;
	for (let stripped = 0; stripped < AGORA_BANNED_WORDS.MAX_PREFIX_LETTERS; stripped += 1) {
		if (rest.length <= word.length || !HEBREW_PREFIXES.has(rest[0])) return false;
		rest = rest.slice(1);
		if (rest === word) return true;
	}

	return false;
}

/**
 * The first banned word the text contains — as the student wrote it, reduced
 * (no niqqud, lower case) — or null. Whole words only: "class" never matches
 * "classic". An entry of several words matches only as that run of words.
 */
export function findBannedWord(text: string, banned: readonly string[]): string | null {
	if (banned.length === 0) return null;
	const tokens = bannedWordTokens(text);
	if (tokens.length === 0) return null;
	const entries = banned
		.map((entry) => bannedWordTokens(entry))
		.filter((entryTokens) => entryTokens.length > 0);

	for (let start = 0; start < tokens.length; start += 1) {
		for (const entryTokens of entries) {
			if (start + entryTokens.length > tokens.length) continue;
			const hit = entryTokens.every((word, offset) => tokenSaysWord(tokens[start + offset], word));
			if (hit) return tokens.slice(start, start + entryTokens.length).join(' ');
		}
	}

	return null;
}
