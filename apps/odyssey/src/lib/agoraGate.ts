import type { OdysseyGame, OdysseyJourney } from '@freedi/shared-types';
import { mintAgoraHandoff } from './callables';

/**
 * The gates between the voyage and the deliberation.
 *
 * An island the player addressed is a question they have taken a position on
 * but not yet worked on with anyone. The gate is where that changes — and
 * because a player picks several islands, the same logic has to serve both
 * places that offer them: the summary's list and the map's islands.
 */

export type GateState =
	/** No deliberation has been opened for this island yet */
	| 'unprovisioned'
	/** Open, and this player has not walked through it */
	| 'open'
	/** This player has already been in — the map marks it and points onward */
	| 'visited';

/**
 * The language the voyage is being read in.
 *
 * Odyssey is authored in Hebrew and says so once, on `<html lang>`; reading it
 * back from there rather than hardcoding 'he' means the day the voyage is
 * translated, the square follows it without anyone remembering this file.
 */
export function voyageLang(): string {
	const declared = document.documentElement.lang.slice(0, 2);

	return declared || 'he';
}

export function getGateState(
	islandStatementId: string,
	game: OdysseyGame,
	journey: OdysseyJourney | null,
): GateState {
	if (!game.agoraSessions?.[islandStatementId]) return 'unprovisioned';

	return journey?.deliberationVisits?.[islandStatementId] ? 'visited' : 'open';
}

/**
 * Sail through an island's gate.
 *
 * Two things have to happen before the browser leaves: the visit is recorded,
 * so the map has the mark waiting when they come back, and a handoff token is
 * minted, so they arrive in Agora as themselves rather than as a stranger with
 * no positions. Neither is allowed to strand the player — a failed write or a
 * refused token still lets them in, just with less carried across.
 */
export async function enterIslandDeliberation(params: {
	islandStatementId: string;
	game: OdysseyGame;
	journey: OdysseyJourney | null;
	agoraOrigin: string;
	updateJourney(patch: Partial<OdysseyJourney>): Promise<void>;
}): Promise<void> {
	const { islandStatementId, game, journey, agoraOrigin, updateJourney } = params;

	const session = game.agoraSessions?.[islandStatementId];
	if (!session) throw new Error(`No deliberation open for island ${islandStatementId}`);

	const origin = agoraOrigin.replace(/\/$/, '');
	if (!origin) throw new Error('Agora origin is not configured');

	if (journey) {
		try {
			await updateJourney({
				deliberationVisits: {
					...(journey.deliberationVisits ?? {}),
					[islandStatementId]: Date.now(),
				},
			});
		} catch (error) {
			console.error('[Odyssey] Could not record the gate visit:', error);
		}
	}

	let handoff = '';
	try {
		handoff = (await mintAgoraHandoff()).token;
	} catch (error) {
		console.error('[Odyssey] Handoff token refused, entering as a newcomer:', error);
	}

	// Agora runs Mithril's hash router, so the `#!` is not decoration —
	// without it the link lands on Agora's home screen instead of the join.
	//
	// `theme` travels with the code because Agora cannot know which world a
	// session belongs to until its document loads, and that is one round trip
	// after the page first paints — long enough to show the wrong colours and
	// then change them under the player who just walked through a gate.
	//
	// `lang` travels for the same reason and a sharper one: left to itself
	// Agora asks the browser, and a Hebrew reader on an English-language
	// browser was arriving at an English square from a Hebrew voyage. The
	// voyage is the authority on which language this player is reading.
	const query = new URLSearchParams({ theme: 'odyssey', lang: voyageLang() });
	if (handoff) query.set('handoff', handoff);
	window.location.href = `${origin}/#!/join/${session.code}?${query.toString()}`;
}
