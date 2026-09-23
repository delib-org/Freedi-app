import { describe, expect, it } from 'vitest';
import { isVillageMode, sessionJoinUrl, sessionVillageMode } from './sessionLinks';

describe('shared session links', () => {
	it('preserves the village and a leading-zero code in a directly routable URL', () => {
		const url = new URL(sessionJoinUrl('https://example.com', '01234', true));
		expect(url.pathname).toBe('/');
		expect(isVillageMode(url.search)).toBe(true);
		expect(url.hash).toBe('#!/join/01234');
	});
	it('keeps ordinary Agora sessions in the ordinary interface', () => {
		expect(sessionJoinUrl('https://example.com', '12345', false)).toBe(
			'https://example.com/#!/join/12345',
		);
		expect(isVillageMode('?world=other')).toBe(false);
	});
});

it('uses the saved village even when a student enters only the code', () => {
	expect(sessionVillageMode('village', '')).toBe(true);
	expect(sessionVillageMode(undefined, '')).toBe(false);
	expect(sessionVillageMode('classic', '')).toBe(false);
	expect(sessionVillageMode('classic', '?world=village')).toBe(false);
	expect(sessionVillageMode(undefined, '?world=village')).toBe(true);
	expect(sessionVillageMode('village', '', false)).toBe(false);
});
