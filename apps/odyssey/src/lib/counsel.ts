import type { OdysseyElder, Statement } from '@freedi/shared-types';
import type { IslandContent } from './game';

/**
 * What a sailor says when consulted on an island.
 *
 * Consulting is the player's move, never the game's: nothing is said until a
 * sailor is tapped, every sailor is offered the same way, and what they say
 * is a value lens on the island — the shore their record leans to and a
 * standing question in their voice — never an instruction on where to sail.
 * That is what keeps a council of personas on the safe side of the
 * equal-juice rule.
 *
 * The data is the elder's own: `positions` gives the shore, `challenges` the
 * line (authored per island, in character). A sailor with no documented
 * position on an island is silent there, as the roster promises — inventing
 * a view would be the exact lie the "בהשראת" framing exists to prevent.
 */

export interface ElderCounsel {
	elder: OdysseyElder;
	/** the shore the sailor's record leans to; null when they have no position */
	leansTo: Statement | null;
	/** 1-based index of `leansTo` among the island's shores */
	shoreNumber: number | null;
	/** the sailor's line on this island; null only when the sailor is silent */
	line: string | null;
	silent: boolean;
}

/** Said in the sailor's place when their record has nothing on this island. */
export const SILENT_LINE = 'בנושא הזה אין לי עמדה מתועדת. כאן אני מקשיב/ה, לא מדבר/ת.';

/**
 * Fallback for an elder patched before `challenges` existed: still their own
 * words, since it is built from the values they were authored with.
 */
function valuesLine(elder: OdysseyElder): string | null {
	const labels = elder.values.map((value) => value.label).filter(Boolean);
	if (labels.length === 0) return null;

	return `מה שמנחה אותי כאן: ${labels.join(', ')}. שקלו גם אתם מה מנחה אתכם.`;
}

export function elderCounsel(elder: OdysseyElder, island: IslandContent): ElderCounsel {
	const declaredId = elder.positions[island.statementId];
	const shoreIndex = declaredId
		? island.stances.findIndex((stance) => stance.statementId === declaredId)
		: -1;
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

/** Every crew member's counsel on one island, in crew order. */
export function crewCounsel(crew: OdysseyElder[], island: IslandContent): ElderCounsel[] {
	return crew.map((elder) => elderCounsel(elder, island));
}
