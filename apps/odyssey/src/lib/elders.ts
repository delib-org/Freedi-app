import type { OdysseyElder, OdysseyGame } from '@freedi/shared-types';
import type { IslandContent } from './game';

/**
 * The Elders on the client: which personas sail this game, how their ships are
 * keyed on the stage, and which authored line answers a marked stance.
 *
 * Elders are AI personas and every surface must say so — ships carry the 📜
 * marker, cards carry the persona line. They keep a lone player company; they
 * never impersonate fellow sailors.
 */

/** Stage/opinion-map id prefix, so elder ships never collide with partyIds. */
export const ELDER_STAGE_PREFIX = 'elder--';

export function elderStageId(elderId: string): string {
	return `${ELDER_STAGE_PREFIX}${elderId}`;
}

export function elderIdFromStageId(stageId: string): string | null {
	return stageId.startsWith(ELDER_STAGE_PREFIX) ? stageId.slice(ELDER_STAGE_PREFIX.length) : null;
}

/**
 * The elders that actually play: authored on the game, enabled, and not
 * switched off by the organizer's script. A game with elders but no script
 * shows them — keeping company is the default; the admin opts out.
 */
export function activeElders(game: OdysseyGame | null | undefined): OdysseyElder[] {
	if (!game?.elders || game.script?.eldersEnabled === false) return [];

	return game.elders.filter((elder) => elder.enabled).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** How many of the closest elders sail with the player at once. */
export const CREW_SIZE = 5;

/**
 * The crew: the elders whose declared courses sit closest to the player's own
 * answers, nearest first.
 *
 * Players used to pick their sailors on a board before the voyage began. The
 * first reviewer said that made no sense — you cannot know whose company you
 * want before you have said anything — and that three was too few. So no one
 * is chosen up front: the crew forms after the first island, from what the
 * player actually answered, and re-forms as they sail on. An elder with no
 * shared island yet (`null` distance) has nothing to say to this player and
 * stays ashore. `journey.selectedElderIds` from the old choosing screen is no
 * longer read.
 *
 * Ties keep the organizer's order, so the crew does not shuffle between two
 * renders of the same answers.
 */
export function crewByCloseness(
	elders: OdysseyElder[],
	distances: Record<string, number | null | undefined>,
	size: number = CREW_SIZE,
): OdysseyElder[] {
	return elders
		.filter((elder) => typeof distances[elder.elderId] === 'number')
		.sort(
			(a, b) =>
				(distances[a.elderId] as number) - (distances[b.elderId] as number) ||
				a.sortOrder - b.sortOrder,
		)
		.slice(0, Math.max(0, size));
}

export interface ElderRemark {
	elder: OdysseyElder;
	line: string;
	/** true when the elder sails with the player on this marking */
	agrees: boolean;
}

/**
 * The authored in-character line answering one marked stance.
 *
 * Agreement is judged against the elder's declared route: supporting the
 * elder's stance (or opposing a rival stance) sails together; supporting a
 * rival (or opposing the elder's own) clashes. The elder is chosen to prefer
 * a clear voice — one that declared the marked stance — and otherwise rotates
 * by stance order so the three voices take turns.
 */
/**
 * The remark for a whole island, chosen AFTER the player submits — reactions
 * during the question phase would be exactly the mid-evaluation nudge the
 * game refuses to make (equal-juice rule). Prefers a marked stance some elder
 * declared (the clearest voice), else the first marked stance.
 */
export function pickIslandRemark(
	elders: OdysseyElder[],
	island: IslandContent,
	attitudes: Record<string, number | undefined>,
): ElderRemark | null {
	const marked = island.stances.filter((stance) => attitudes[stance.statementId] !== undefined);
	if (marked.length === 0) return null;

	const declaredIds = new Set(
		elders
			.map((elder) => elder.positions[island.statementId])
			.filter((id): id is string => Boolean(id)),
	);
	const focus = marked.find((stance) => declaredIds.has(stance.statementId)) ?? marked[0];

	return pickElderReaction(elders, island, focus.statementId, attitudes[focus.statementId] ?? 0);
}

export function pickElderReaction(
	elders: OdysseyElder[],
	island: IslandContent,
	stanceId: string,
	evaluationValue: number,
): ElderRemark | null {
	const present = elders.filter((elder) => elder.positions[island.statementId]);
	if (present.length === 0) return null;

	const declaredHere = present.find((elder) => elder.positions[island.statementId] === stanceId);
	const stanceIndex = island.stances.findIndex((stance) => stance.statementId === stanceId);
	const elder = declaredHere ?? present[Math.abs(stanceIndex) % present.length];

	const declaredId = elder.positions[island.statementId];
	const supports = evaluationValue > 0;
	const agrees = supports ? declaredId === stanceId : declaredId !== stanceId;

	// reactions[declared] carries the agree line, any sibling the oppose line.
	const siblingId = island.stances
		.map((stance) => stance.statementId)
		.find((id) => id !== declaredId);
	const line = agrees
		? elder.reactions[declaredId]
		: (elder.reactions[stanceId !== declaredId ? stanceId : (siblingId ?? '')] ?? null);
	if (!line) return null;

	return { elder, line, agrees };
}
