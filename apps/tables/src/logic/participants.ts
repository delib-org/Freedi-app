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

/** uid -> display name, for printing tables. */
export function nameByUid(
	participants: readonly TableAssignmentRosterEntry[],
): Map<string, string> {
	return new Map(participants.map((p) => [p.uid, p.fullName]));
}
