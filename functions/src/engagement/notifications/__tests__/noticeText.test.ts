import {
	answerPreview,
	answerUpdateCopy,
	decidedCopy,
	DEFAULT_NOTICE_LANGUAGE,
	pickNoticeLanguage,
} from '../noticeText';

describe('pickNoticeLanguage', () => {
	it('prefers the stored language', () => {
		expect(pickNoticeLanguage('en', 'טקסט בעברית')).toBe('en');
		expect(pickNoticeLanguage('he', 'English text')).toBe('he');
	});

	it('reads a regional code', () => {
		expect(pickNoticeLanguage('he-IL')).toBe('he');
		expect(pickNoticeLanguage('EN-us')).toBe('en');
	});

	it('falls back to the text for a language it has no words for', () => {
		expect(pickNoticeLanguage('ar', 'טקסט בעברית')).toBe('he');
		expect(pickNoticeLanguage('de', 'Plain text')).toBe('en');
	});

	it('uses the script of the text when nothing is stored', () => {
		expect(pickNoticeLanguage(undefined, 'טקסט בעברית')).toBe('he');
		expect(pickNoticeLanguage(undefined, 'Plain text')).toBe('en');
	});

	it('treats mixed text as Hebrew', () => {
		expect(pickNoticeLanguage(undefined, 'טקסט with English')).toBe('he');
	});

	it('uses the default when nothing says', () => {
		expect(pickNoticeLanguage(undefined)).toBe(DEFAULT_NOTICE_LANGUAGE);
		expect(pickNoticeLanguage(undefined, '12345')).toBe(DEFAULT_NOTICE_LANGUAGE);
		expect(DEFAULT_NOTICE_LANGUAGE).toBe('he');
	});
});

describe('answerPreview', () => {
	it('keeps a short text whole', () => {
		expect(answerPreview('short')).toBe('short');
	});

	it('keeps a text of exactly the limit whole', () => {
		const text = 'a'.repeat(60);

		expect(answerPreview(text)).toBe(text);
	});

	it('cuts a longer text and marks it', () => {
		expect(answerPreview('a'.repeat(61))).toBe(`${'a'.repeat(60)}...`);
	});
});

describe('notice wording', () => {
	it('matches the reviewed Hebrew for the update', () => {
		expect(answerUpdateCopy('he', 'X')).toEqual({
			title: 'עדכון על התשובה שלך',
			body: 'עוד אנשים דירגו את התשובה שלך "X" וציון ההסכמה שלה השתנה. הציון מופיע ליד התשובה.',
		});
	});

	it('uses the reviewed wording for several answers', () => {
		expect(decidedCopy('he', undefined)).toEqual({
			title: 'הקבוצה החליטה',
			body: 'התשובות שלך היו חלק ממה שהקבוצה שקלה. התוצאות פתוחות עכשיו לכולם.',
		});
	});
});
