import { parseBulkOptions } from '../parseBulkOptions';

describe('parseBulkOptions', () => {
	it('returns an empty array for empty or whitespace-only input', () => {
		expect(parseBulkOptions('')).toEqual([]);
		expect(parseBulkOptions('   \n  \n\t')).toEqual([]);
	});

	it('skips blank lines between entries', () => {
		const result = parseBulkOptions('Alpha\n\n\nBeta\n\nGamma');
		expect(result).toEqual([
			{ title: 'Alpha', description: '' },
			{ title: 'Beta', description: '' },
			{ title: 'Gamma', description: '' },
		]);
	});

	it('strips leading bullet characters and surrounding whitespace', () => {
		const input = ['• First', '- Second', '* Third', '– Fourth', '— Fifth', '   •   Sixth'].join(
			'\n',
		);
		const result = parseBulkOptions(input);
		expect(result.map((r) => r.title)).toEqual([
			'First',
			'Second',
			'Third',
			'Fourth',
			'Fifth',
			'Sixth',
		]);
		expect(result.every((r) => r.description === '')).toBe(true);
	});

	it('splits on a dash with surrounding spaces into title + description', () => {
		const result = parseBulkOptions('Title — Some description here');
		expect(result).toEqual([{ title: 'Title', description: 'Some description here' }]);
	});

	it('splits on " - " hyphen with surrounding spaces', () => {
		const result = parseBulkOptions('Title - description');
		expect(result).toEqual([{ title: 'Title', description: 'description' }]);
	});

	it('does not split on a hyphen used as part of a word (no surrounding spaces)', () => {
		const result = parseBulkOptions('Decision-making process');
		expect(result).toEqual([{ title: 'Decision-making process', description: '' }]);
	});

	it('splits on the first ": " when no dash separator is present', () => {
		const result = parseBulkOptions('Outreach: door-to-door visits');
		expect(result).toEqual([{ title: 'Outreach', description: 'door-to-door visits' }]);
	});

	it('preserves Hebrew text and parenthetical notes verbatim', () => {
		const input = [
			'• דוכני הסברה ברחבי הישוב  / צוות מדלת לדלת',
			'• שילוט עקבי קבוע',
			'• קונצרט בפ"ח עם זמרים מוכרים (שורה 192 באקסל)',
		].join('\n');
		const result = parseBulkOptions(input);
		expect(result).toEqual([
			{ title: 'דוכני הסברה ברחבי הישוב  / צוות מדלת לדלת', description: '' },
			{ title: 'שילוט עקבי קבוע', description: '' },
			{ title: 'קונצרט בפ"ח עם זמרים מוכרים (שורה 192 באקסל)', description: '' },
		]);
	});

	it('keeps a "+" connector inside a title rather than splitting on it', () => {
		const input = '• ספיד דייטינג + ערבי שיח בין קהילתיים';
		const result = parseBulkOptions(input);
		expect(result).toEqual([{ title: 'ספיד דייטינג + ערבי שיח בין קהילתיים', description: '' }]);
	});

	it('drops lines that contain only bullets or whitespace after stripping', () => {
		const result = parseBulkOptions('•\n  -  \nReal entry\n*\n');
		expect(result).toEqual([{ title: 'Real entry', description: '' }]);
	});

	it('strips leading numbered-list prefixes (1., 1), 1-, 1:)', () => {
		const input = [
			'1. First',
			'2) Second',
			'3- Third',
			'4: Fourth',
			'01. Fifth',
			'100. Sixth',
		].join('\n');
		const result = parseBulkOptions(input);
		expect(result.map((r) => r.title)).toEqual([
			'First',
			'Second',
			'Third',
			'Fourth',
			'Fifth',
			'Sixth',
		]);
	});

	it('strips combined number + bullet prefixes in any order', () => {
		const result = parseBulkOptions('1. • Alpha\n• 2) Beta');
		expect(result.map((r) => r.title)).toEqual(['Alpha', 'Beta']);
	});

	it('does NOT strip numeric content inside the title (e.g., "1.5 km")', () => {
		const result = parseBulkOptions('1.5 km daily walk');
		expect(result).toEqual([{ title: '1.5 km daily walk', description: '' }]);
	});

	it('does NOT strip when separator is followed by a digit (no whitespace)', () => {
		const result = parseBulkOptions('2024 election plan');
		expect(result).toEqual([{ title: '2024 election plan', description: '' }]);
	});

	it('strips numbered prefix and still splits on the en-dash separator', () => {
		const result = parseBulkOptions('1. Title – the description');
		expect(result).toEqual([{ title: 'Title', description: 'the description' }]);
	});

	it('parses a numbered Hebrew list with parenthetical stats and en-dash descriptions', () => {
		const input = [
			'1. שינוי מיקוד ההפגנות במוצ"ש להכנה לבחירות (cons=0.772, n=12, 100% pro) – להעביר את ההפגנות הקיימות ממסר של "ללכת" למסר של "להחליף בבחירות"',
			'2) חינוך לחשיבה ביקורתית וזיהוי פייק ניוז בבתי ספר תיכוניים (cons=0.772, n=21, 100% pro) – הרצאות וסדנאות לבוחרים צעירים',
			'3- הבאת צעירים להפגנות (cons=0.722, n=9, 100% pro) – ניסוח קונקרטי וחד',
		].join('\n');
		const result = parseBulkOptions(input);
		expect(result).toHaveLength(3);
		expect(result[0].title).toBe(
			'שינוי מיקוד ההפגנות במוצ"ש להכנה לבחירות (cons=0.772, n=12, 100% pro)',
		);
		expect(result[0].description).toBe(
			'להעביר את ההפגנות הקיימות ממסר של "ללכת" למסר של "להחליף בבחירות"',
		);
		expect(result[1].title).toBe(
			'חינוך לחשיבה ביקורתית וזיהוי פייק ניוז בבתי ספר תיכוניים (cons=0.772, n=21, 100% pro)',
		);
		expect(result[2].title).toBe('הבאת צעירים להפגנות (cons=0.722, n=9, 100% pro)');
		expect(result[2].description).toBe('ניסוח קונקרטי וחד');
	});

	it('parses a realistic mixed list end-to-end', () => {
		const input = [
			'• דוכני הסברה ברחבי הישוב  / צוות מדלת לדלת ',
			'• שילוט עקבי קבוע',
			'• הפגנות קונספט ',
			'• צעדות מקומיות',
			'• חלוקת פרחים ביחד עם ברושורים ',
			'• הייד פארק',
			'• ספיד דייטינג + ערבי שיח בין קהילתיים',
			'• ארגון מפגשים עם קבוצות נוער',
			'• חיבור לחברה הערבית – מפגשים וסיוע להוציא בוחרים והגנה על קלפיות',
			'• ארגון חוגי בית',
			'• צוות תוכן שיכין חמרים לפלאיירים,  טעונים ועובדות',
			'• קונצרט בפ"ח עם זמרים מוכרים (שורה 192 באקסל)',
			'• שירה בציבור – להדגשת המשותף ןהמאחד (הצעה מאוחרת,  לא נכנסה)',
			'• משמרות יומיות בצומת עם שלטים לעידוד הצבעה ',
		].join('\n');
		const result = parseBulkOptions(input);
		expect(result).toHaveLength(14);
		expect(result[0].title).toBe('דוכני הסברה ברחבי הישוב  / צוות מדלת לדלת');
		expect(result[6].title).toBe('ספיד דייטינג + ערבי שיח בין קהילתיים');
		expect(result[8]).toEqual({
			title: 'חיבור לחברה הערבית',
			description: 'מפגשים וסיוע להוציא בוחרים והגנה על קלפיות',
		});
		expect(result[11].title).toBe('קונצרט בפ"ח עם זמרים מוכרים (שורה 192 באקסל)');
	});
});
