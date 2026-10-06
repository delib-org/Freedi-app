import { describe, expect, it } from 'vitest';
import { DECIDE_WIND_ID, compassArtUrl } from '../compassArt';

describe('compassArtUrl', () => {
	it('maps the seeded wind slugs to bundled asset paths', () => {
		expect(compassArtUrl('love')).toBe('/assets/compass/wind-love.webp');
		expect(compassArtUrl('worry')).toBe('/assets/compass/wind-worry.webp');
		expect(compassArtUrl('listen')).toBe('/assets/compass/wind-listen.webp');
		expect(compassArtUrl(DECIDE_WIND_ID)).toBe('/assets/compass/wind-decide.webp');
	});

	it('gives an admin-invented wind no emblem rather than a guess', () => {
		expect(compassArtUrl('hope')).toBeNull();
		expect(compassArtUrl('')).toBeNull();
	});
});
