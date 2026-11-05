import type { TableAssignmentParticipant } from '@freedi/shared-types';

/**
 * Host-side counts. Positions and preferences are only ever counted, never
 * shown per person: the host sees names and totals (IA section 1).
 */
export interface ParticipantSummary {
	registered: number;
	withPreferences: number;
	withPosition: number;
	/** Registered people who did not state a position ("לא צוין"). */
	notSpecified: number;
}

export function summarizeParticipants(
	participants: readonly TableAssignmentParticipant[],
): ParticipantSummary {
	const withPosition = participants.filter((p) => typeof p.position === 'number').length;

	return {
		registered: participants.length,
		withPreferences: participants.filter((p) => p.preferences.length > 0).length,
		withPosition,
		notSpecified: participants.length - withPosition,
	};
}

/** Names only, in registration order. */
export function participantNames(participants: readonly TableAssignmentParticipant[]): string[] {
	return [...participants].sort((a, b) => a.registeredAt - b.registeredAt).map((p) => p.fullName);
}

/** uid -> display name, for printing tables. */
export function nameByUid(
	participants: readonly TableAssignmentParticipant[],
): Map<string, string> {
	return new Map(participants.map((p) => [p.uid, p.fullName]));
}
