/**
 * Bundled emblems for the four winds of the compass (see
 * docs/compass-winds-prompt.md). Four cards that differ only in their Hebrew
 * heading read as one long form; an emblem gives each wind a face, so a player
 * scrolling back knows which question they are looking at before they read it.
 *
 * Keyed by `questionId`, which the seed mints as the wind's slug — the ids are
 * stable across reseeds, while sortOrder is only the order the admin happens to
 * have them in. The fourth wind (רוח ההכרעה, the value ranking) has no question
 * doc of its own, so it is keyed by the reserved slug below.
 *
 * A wind the admin invented has no emblem and gets none: the card simply keeps
 * its old headline-only header.
 */

/** The values wind — the one card that is not a compassQuestion doc. */
export const DECIDE_WIND_ID = 'decide';

const ART: Record<string, string> = {
	love: 'wind-love',
	worry: 'wind-worry',
	listen: 'wind-listen',
	[DECIDE_WIND_ID]: 'wind-decide',
};

export function compassArtUrl(questionId: string): string | null {
	const file = ART[questionId];

	return file ? `/assets/compass/${file}.webp` : null;
}
