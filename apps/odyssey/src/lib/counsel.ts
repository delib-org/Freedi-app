import type { OdysseyElder, Statement } from '@freedi/shared-types';
import type { IslandContent } from './game';

/**
 * What a sailor says when consulted — on the island as a whole, or on one of
 * its shores (see docs/ia/odyssey-crew-counsel.md).
 *
 * Consulting is the player's move, never the game's: nothing is said until a
 * sailor is tapped, every sailor is offered the same way, and what they say
 * is a value lens — the shore their record leans to and a standing question
 * in their voice — never an instruction on where to sail. That is what keeps
 * a council of personas on the safe side of the equal-juice rule.
 *
 * The data is the elder's own: `positions` gives the lean, `challenges` the
 * island line, `counsel` the per-shore line (authored per island and shore,
 * in character). A sailor with no documented position on an island has no
 * lean there, as the roster promises — inventing one would be the exact lie
 * the "בהשראת" framing exists to prevent. `reactions` are never read here:
 * they answer a mark, and a question has not been marked yet.
 */

/** Said in the sailor's place when their record has no lean on this island. */
export const SILENT_LINE = 'אין לי נטייה מתועדת כאן. כאן אני מקשיב/ה, לא מדבר/ת.';

/** The one persona disclaimer, on every card a sailor speaks from. */
export const AI_PERSONA_NOTE = '📜 דמות בינה מלאכותית — שחזור משוער, לא ציטוט ולא המלצת הצבעה';

export interface IslandCounsel {
	elder: OdysseyElder;
	/** the shore the sailor's record leans to; null when they have no position */
	leansTo: Statement | null;
	/** 1-based index of `leansTo` among the island's shores */
	shoreNumber: number | null;
	/** the sailor's line on this island; null only when the sailor is silent */
	line: string | null;
	silent: boolean;
}

/**
 * Where a sailor's record points, as a card states it: at the shore being
 * asked about, at another shore by number, or nowhere on this island.
 */
export type CounselLean =
	| { kind: 'here' }
	| { kind: 'shore'; number: number; text: string }
	| { kind: 'silent' };

export interface ShoreCounsel {
	elder: OdysseyElder;
	stance: Statement;
	lean: CounselLean;
	/**
	 * the sailor's line for this shore; the island line when none was authored
	 * for the shore (then `lineAboutIsland` is true); null when they have none
	 */
	line: string | null;
	/** true when `line` is the sailor's island line, shown in place of a shore line */
	lineAboutIsland: boolean;
}

/**
 * Fallback for an elder patched before `challenges` existed: still their own
 * words, since it is built from the values they were authored with.
 */
function valuesLine(elder: OdysseyElder): string | null {
	const labels = elder.values.map((value) => value.label).filter(Boolean);
	if (labels.length === 0) return null;

	return `מה שמנחה אותי כאן: ${labels.join(', ')}. שקלו גם אתם מה מנחה אתכם.`;
}

/** Index of the shore the sailor declared on this island, or -1. */
function declaredShoreIndex(elder: OdysseyElder, island: IslandContent): number {
	const declaredId = elder.positions[island.statementId];

	return declaredId ? island.stances.findIndex((stance) => stance.statementId === declaredId) : -1;
}

/** One sailor's counsel on the island as a whole. */
export function islandCounsel(elder: OdysseyElder, island: IslandContent): IslandCounsel {
	const shoreIndex = declaredShoreIndex(elder, island);
	const leansTo = shoreIndex === -1 ? null : island.stances[shoreIndex];
	const authored = elder.challenges[island.statementId]?.trim();

	if (!leansTo && !authored) {
		return { elder, leansTo: null, shoreNumber: null, line: null, silent: true };
	}

	return {
		elder,
		leansTo,
		shoreNumber: leansTo ? shoreIndex + 1 : null,
		line: authored || valuesLine(elder),
		silent: false,
	};
}

/** Every crew member's island counsel, in crew order. */
export function crewCounsel(crew: OdysseyElder[], island: IslandContent): IslandCounsel[] {
	return crew.map((elder) => islandCounsel(elder, island));
}

/** The island card's lean row: the declared shore by number, or no lean at all. */
export function islandLean(counsel: IslandCounsel): CounselLean {
	return counsel.leansTo && counsel.shoreNumber !== null
		? { kind: 'shore', number: counsel.shoreNumber, text: counsel.leansTo.statement }
		: { kind: 'silent' };
}

/**
 * One sailor's counsel on one shore.
 *
 * The lean is the same record `islandCounsel` reads, now relative to the shore
 * asked about: here, another shore by number, or none. The line is the
 * authored `counsel[island][shore]`; when that was never written (the twelve
 * default sailors, until the content pass) the island line stands in, and the
 * card says so — a line about the island must not pass for a line about this
 * shore.
 */
export function shoreCounsel(
	elder: OdysseyElder,
	island: IslandContent,
	stance: Statement,
): ShoreCounsel {
	const shoreIndex = declaredShoreIndex(elder, island);
	const lean: CounselLean =
		shoreIndex === -1
			? { kind: 'silent' }
			: island.stances[shoreIndex].statementId === stance.statementId
				? { kind: 'here' }
				: {
						kind: 'shore',
						number: shoreIndex + 1,
						text: island.stances[shoreIndex].statement,
					};

	const authored = elder.counsel?.[island.statementId]?.[stance.statementId]?.trim();
	if (authored) {
		return { elder, stance, lean, line: authored, lineAboutIsland: false };
	}

	const aboutIsland = islandCounsel(elder, island).line;

	return { elder, stance, lean, line: aboutIsland, lineAboutIsland: aboutIsland !== null };
}

/** Every crew member's counsel on one shore, in crew order. */
export function crewShoreCounsel(
	crew: OdysseyElder[],
	island: IslandContent,
	stance: Statement,
): ShoreCounsel[] {
	return crew.map((elder) => shoreCounsel(elder, island, stance));
}
