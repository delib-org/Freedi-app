/**
 * Bundled island illustrations (AI-generated miniature-diorama islets with
 * real alpha, matching the ship.png style; see
 * docs/island-sprites-codex-prompt.md). Admin-set `imageUrl` always wins;
 * these are the default art for the seeded islands, keyed by sortOrder (1..12).
 */

export const ISLAND_ART_COUNT = 12;

export function islandArtUrl(sortOrder: number): string | null {
	if (!Number.isInteger(sortOrder) || sortOrder < 1 || sortOrder > ISLAND_ART_COUNT) {
		return null;
	}

	return `/assets/islands/island-${String(sortOrder).padStart(2, '0')}.webp`;
}
