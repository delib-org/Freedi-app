import type { TableAssignmentRosterEntry } from '@freedi/shared-types';

/** How a person's table relates to what they asked for: the pill on My table. */
export type ChoiceOutcome =
	| { kind: 'choice'; rank: number }
	| { kind: 'outside' }
	| { kind: 'none' };

export function choiceOutcome(preferences: readonly string[], topicId: string): ChoiceOutcome {
	if (preferences.length === 0) return { kind: 'none' };

	const index = preferences.indexOf(topicId);

	return index >= 0 ? { kind: 'choice', rank: index + 1 } : { kind: 'outside' };
}

/** The names of the others at a published table; a name not yet readable is left out. */
export function matesOfRunTable(
	memberUids: readonly string[],
	myUid: string,
	roster: readonly TableAssignmentRosterEntry[],
): string[] {
	const names = new Map(roster.map((entry) => [entry.uid, entry.fullName]));

	return memberUids.flatMap((uid) => (uid === myUid ? [] : (names.get(uid) ?? [])));
}

/** The names of the others who chose the same table (free mode). */
export function matesAtChosenTable(
	tableIndex: number,
	myUid: string,
	roster: readonly TableAssignmentRosterEntry[],
): string[] {
	return roster
		.filter((entry) => entry.chosenTableIndex === tableIndex && entry.uid !== myUid)
		.map((entry) => entry.fullName);
}

export interface SeatPoint {
	x: number;
	y: number;
}

/** Evenly spaced seats around the table, the first one (the person's own) on top. */
export function seatPoints(count: number, center: number, radius: number): SeatPoint[] {
	return Array.from({ length: count }, (_, seat) => {
		const angle = (2 * Math.PI * seat) / count;

		return {
			x: Math.round(center + radius * Math.sin(angle)),
			y: Math.round(center - radius * Math.cos(angle)),
		};
	});
}
