import { AGORA_BANNED_WORDS, cleanBannedWords, findBannedWord } from '../index';

describe('findBannedWord', () => {
	it('returns null for an empty list or empty text', () => {
		expect(findBannedWord('hello there', [])).toBeNull();
		expect(findBannedWord('', ['bad'])).toBeNull();
		expect(findBannedWord('   ', ['bad'])).toBeNull();
	});

	it('matches whole words only', () => {
		expect(findBannedWord('that is a bad idea', ['bad'])).toBe('bad');
		expect(findBannedWord('a badge and a badly worded note', ['bad'])).toBeNull();
		expect(findBannedWord('class', ['ass'])).toBeNull();
	});

	it('ignores case', () => {
		expect(findBannedWord('You are STUPID', ['stupid'])).toBe('stupid');
		expect(findBannedWord('you are stupid', ['STUPID'])).toBe('stupid');
	});

	it('ignores punctuation around and inside the text', () => {
		expect(findBannedWord('stupid!!!', ['stupid'])).toBe('stupid');
		expect(findBannedWord('(stupid), really', ['stupid'])).toBe('stupid');
		expect(findBannedWord('so-stupid', ['stupid'])).toBe('stupid');
		expect(findBannedWord('דבר מטומטם.', ['מטומטם'])).toBe('מטומטם');
	});

	it('matches Hebrew words, with or without niqqud', () => {
		expect(findBannedWord('אתה טָמְבָּל גמור', ['טמבל'])).toBe('טמבל');
		expect(findBannedWord('אתה טמבל גמור', ['טָמְבָּל'])).toBe('טמבל');
	});

	it('matches a Hebrew word behind one-letter prefixes', () => {
		for (const prefix of ['ו', 'ה', 'ב', 'ל', 'מ', 'ש', 'כ']) {
			expect(findBannedWord(`דיברתי ${prefix}טמבל`, ['טמבל'])).toBe(`${prefix}טמבל`);
		}
		expect(findBannedWord('ושהטמבל הלך', ['טמבל'])).toBe('ושהטמבל');
	});

	it('stops at three stacked prefixes and never strips a non-prefix letter', () => {
		expect(findBannedWord('וכשהטמבל', ['טמבל'])).toBeNull();
		expect(findBannedWord('נטמבל', ['טמבל'])).toBeNull();
		expect(findBannedWord('טמבלים', ['טמבל'])).toBeNull();
	});

	it('does not run short Hebrew entries through the prefix rule', () => {
		expect(findBannedWord('הוא בן אדם', ['בן'])).toBe('בן');
		expect(findBannedWord('צבע לבן', ['בן'])).toBeNull();
	});

	it('does not apply Hebrew prefixes to Latin entries', () => {
		expect(findBannedWord('lstupid', ['stupid'])).toBeNull();
	});

	it('treats geresh, apostrophe and gershayim as part of the word', () => {
		expect(findBannedWord("ג'ינג'י", ['ג׳ינג׳י'])).toBe('גינגי');
		expect(findBannedWord('dont say it', ["don't"])).toBe('dont');
	});

	it('matches a phrase only as that run of words', () => {
		expect(findBannedWord('shut up now', ['shut up'])).toBe('shut up');
		expect(findBannedWord('shut the door up', ['shut up'])).toBeNull();
	});

	it('returns the first match in the text', () => {
		expect(findBannedWord('first dumb then stupid', ['stupid', 'dumb'])).toBe('dumb');
	});
});

describe('cleanBannedWords', () => {
	it('trims, drops blanks and duplicates (by reduced form), keeps own spelling', () => {
		expect(cleanBannedWords(['  Stupid ', 'stupid!', '', '   ', '---', 'טָמְבָּל', 'טמבל'])).toEqual([
			'Stupid',
			'טָמְבָּל',
		]);
	});

	it('caps entry length and list size', () => {
		const long = 'a'.repeat(AGORA_BANNED_WORDS.MAX_WORD_LENGTH + 20);
		expect(cleanBannedWords([long])[0]).toHaveLength(AGORA_BANNED_WORDS.MAX_WORD_LENGTH);
		const many = Array.from({ length: AGORA_BANNED_WORDS.MAX_WORDS + 50 }, (_, i) => `w${i}`);
		expect(cleanBannedWords(many)).toHaveLength(AGORA_BANNED_WORDS.MAX_WORDS);
	});
});
