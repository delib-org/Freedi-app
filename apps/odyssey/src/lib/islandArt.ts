/**
 * Bundled island illustrations (cropped from the game's poster art, same
 * painterly style as ship.png). Admin-set `imageUrl` always wins; these are
 * the default art for the seeded islands, keyed by their sortOrder (1..12).
 */

export const ISLAND_ART_COUNT = 12;

export function islandArtUrl(sortOrder: number): string | null {
	if (!Number.isInteger(sortOrder) || sortOrder < 1 || sortOrder > ISLAND_ART_COUNT) {
		return null;
	}

	return `/assets/islands/island-${String(sortOrder).padStart(2, '0')}.png`;
}
