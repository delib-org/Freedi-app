import { pickAnswerHiddenLanguage } from '../answerHiddenNotice';

describe('pickAnswerHiddenLanguage', () => {
	it.each([
		['he', 'he'],
		['ar', 'ar'],
		['fa-IR', 'fa'],
		['es', 'es'],
		['de', 'de'],
		['NL', 'nl'],
		['en-US', 'en'],
		['fr', 'en'],
	])('uses the stored language %s', (storedLanguage, expected) => {
		expect(pickAnswerHiddenLanguage(storedLanguage, 'שלום')).toBe(expected);
	});

	it('falls back to the script of the text', () => {
		expect(pickAnswerHiddenLanguage(undefined, 'שלום hello')).toBe('he');
		expect(pickAnswerHiddenLanguage(undefined, 'مرحبا')).toBe('ar');
		expect(pickAnswerHiddenLanguage(undefined, 'hello')).toBe('en');
		expect(pickAnswerHiddenLanguage(undefined, '123')).toBe('he');
	});
});
