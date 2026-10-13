import { countMeaningfulWords, isMeaningfulSuggestion } from '../meaningfulText';

describe('isMeaningfulSuggestion', () => {
	it.each(['ייי', 'ככע', 'aaa', '   ', 'ססס סס', 'א ב ג', '!!! ???', 'ספרייה'])(
		'refuses keyboard noise or a lone word: %p',
		(text) => {
			expect(isMeaningfulSuggestion(text)).toBe(false);
		},
	);

	it.each([
		'לשפר את השיח בין התשובים',
		'הספרייה היישובית',
		'More shade trees',
		'Ride bikes, 20 km',
	])('accepts real text: %p', (text) => {
		expect(isMeaningfulSuggestion(text)).toBe(true);
	});

	it('counts only real words', () => {
		expect(countMeaningfulWords('ייי לשפר את a הנוי')).toBe(3);
	});
});
