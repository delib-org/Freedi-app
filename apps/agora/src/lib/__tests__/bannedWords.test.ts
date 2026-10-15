import { describe, it, expect, vi } from 'vitest';

vi.mock('../firebase', () => ({ db: {}, doc: vi.fn(), getDoc: vi.fn() }));
vi.mock('../callables', () => ({ setBannedWords: vi.fn() }));

import { entriesToAdd } from '../bannedWords';

describe('entriesToAdd', () => {
	it('splits on commas and line breaks, trimming each', () => {
		expect(entriesToAdd('stupid,  dumb \n idiot', [])).toEqual(['stupid', 'dumb', 'idiot']);
		expect(entriesToAdd('מטומטם، טמבל', [])).toEqual(['מטומטם', 'טמבל']);
	});

	it('leaves out blanks and what is already listed, however it is spelled', () => {
		expect(entriesToAdd(' , ,', [])).toEqual([]);
		expect(entriesToAdd('Stupid, dumb', ['stupid!'])).toEqual(['dumb']);
		expect(entriesToAdd('טָמְבָּל', ['טמבל'])).toEqual([]);
	});

	it('does not add the same entry twice in one go', () => {
		expect(entriesToAdd('dumb, DUMB', [])).toEqual(['dumb']);
	});
});
