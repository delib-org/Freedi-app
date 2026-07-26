import { describe, expect, it } from 'vitest';
import { ISLAND_ART_COUNT, islandArtUrl } from '../islandArt';

describe('islandArtUrl', () => {
	it('maps sortOrder to the bundled zero-padded asset path', () => {
		expect(islandArtUrl(1)).toBe('/assets/islands/island-01.webp');
		expect(islandArtUrl(12)).toBe('/assets/islands/island-12.webp');
	});

	it('returns null outside the bundled range', () => {
		expect(islandArtUrl(0)).toBeNull();
		expect(islandArtUrl(ISLAND_ART_COUNT + 1)).toBeNull();
		expect(islandArtUrl(2.5)).toBeNull();
		expect(islandArtUrl(-3)).toBeNull();
	});
});
