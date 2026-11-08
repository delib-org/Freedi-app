import { tablesHostUrl, tablesSessionUrl } from '../urls';

describe('tablesSessionUrl', () => {
	it('builds the participant link', () => {
		expect(tablesSessionUrl('https://tables.wizcol.com', 'abc')).toBe(
			'https://tables.wizcol.com/sessions/abc',
		);
	});

	it('tolerates a trailing slash and encodes the id', () => {
		expect(tablesSessionUrl('https://tables.wizcol.com/', 'a b')).toBe(
			'https://tables.wizcol.com/sessions/a%20b',
		);
	});
});

describe('tablesHostUrl', () => {
	it('points at the host list without an id', () => {
		expect(tablesHostUrl('https://tables.wizcol.com')).toBe('https://tables.wizcol.com/host');
	});

	it('points at one session home with an id', () => {
		expect(tablesHostUrl('https://tables.wizcol.com/', 'abc')).toBe(
			'https://tables.wizcol.com/host/sessions/abc',
		);
	});
});
