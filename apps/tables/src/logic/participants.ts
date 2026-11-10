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

/** Names only, in registration order. */
export function participantNames(participants: readonly TableAssignmentRosterEntry[]): string[] {
	return [...participants].sort((a, b) => a.registeredAt - b.registeredAt).map((p) => p.fullName);
}

/** uid -> display name, for printing tables. */
export function nameByUid(
	participants: readonly TableAssignmentRosterEntry[],
): Map<string, string> {
	return new Map(participants.map((p) => [p.uid, p.fullName]));
}
