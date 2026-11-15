import type { TableAssignmentRosterEntry } from '@freedi/shared-types';

/** Host-side counts. The host reads name cards, which hold progress and never an answer (IA section 1). */
export interface ParticipantSummary {
	registered: number;
	withPreferences: number;
}

export function summarizeParticipants(
	participants: readonly TableAssignmentRosterEntry[],
): ParticipantSummary {
	return {
		registered: participants.length,
		withPreferences: participants.filter((p) => p.hasPreferences).length,
	};
}

/** Name cards in registration order, those matching the search text only. */
export function rosterMatching(
	participants: readonly TableAssignmentRosterEntry[],
	search: string,
): TableAssignmentRosterEntry[] {
	const needle = search.trim().toLowerCase();

	return [...participants]
		.sort((a, b) => a.registeredAt - b.registeredAt)
		.filter((p) => p.fullName.toLowerCase().includes(needle));
}

/** Whether every one of `shown` is selected (false for an empty list). */
export function allSelected(
	shown: readonly TableAssignmentRosterEntry[],
	selected: ReadonlySet<string>,
): boolean {
	return shown.length > 0 && shown.every((person) => selected.has(person.uid));
}

/** One person ticked or unticked. Returns a new set. */
export function toggleSelected(selected: ReadonlySet<string>, uid: string): Set<string> {
	const next = new Set(selected);
	if (!next.delete(uid)) next.add(uid);

	return next;
}

/**
 * The "select all shown" box: ticks everyone shown, or, when all of them are
 * already ticked, unticks them. People hidden by the search keep their state.
 */
export function toggleAllShown(
	shown: readonly TableAssignmentRosterEntry[],
	selected: ReadonlySet<string>,
): Set<string> {
	const next = new Set(selected);
	const untick = allSelected(shown, selected);
	for (const person of shown) {
		if (untick) next.delete(person.uid);
		else next.add(person.uid);
	}

	return next;
}

/** The ticked people who are still registered, in the list's order. Someone who left meanwhile drops out. */
export function selectedPeople(
	participants: readonly TableAssignmentRosterEntry[],
	selected: ReadonlySet<string>,
): TableAssignmentRosterEntry[] {
	return rosterMatching(participants, '').filter((person) => selected.has(person.uid));
}

/** Slices of at most `size`, so one removal call never exceeds the server's cap. */
export function inBatches<T>(items: readonly T[], size: number): T[][] {
	const batches: T[][] = [];
	for (let start = 0; start < items.length; start += size) {
		batches.push(items.slice(start, start + size));
	}

	return batches;
}

/** uid -> display name, for printing tables. */
export function nameByUid(
	participants: readonly TableAssignmentRosterEntry[],
): Map<string, string> {
	return new Map(participants.map((p) => [p.uid, p.fullName]));
}
