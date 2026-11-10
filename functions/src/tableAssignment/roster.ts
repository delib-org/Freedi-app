import { tableAssignmentNameKey } from '@freedi/shared-types';
import type {
	TableAssignmentCounter,
	TableAssignmentParticipant,
	TableAssignmentRosterEntry,
} from '@freedi/shared-types';

/**
 * Pure builders of the two public records of a registration. The name card
 * lists its fields one by one on purpose: whatever is added to the private
 * record stays private unless someone decides otherwise here.
 */
export function rosterEntryFrom(
	participant: TableAssignmentParticipant,
): TableAssignmentRosterEntry {
	const { sessionId, uid, fullName, registeredAt, preferences, chosenTableIndex } = participant;

	return {
		sessionId,
		uid,
		fullName,
		nameKey: tableAssignmentNameKey(fullName),
		registeredAt,
		hasPreferences: preferences.length > 0,
		...(chosenTableIndex === undefined ? {} : { chosenTableIndex }),
	};
}

export interface RosterBackfill {
	entries: TableAssignmentRosterEntry[];
	counters: TableAssignmentCounter[];
}

/** What the existing data should become: one card per registration, one true count per session. */
export function planRosterBackfill(
	sessionIds: readonly string[],
	participants: readonly TableAssignmentParticipant[],
): RosterBackfill {
	const registeredBySession = new Map<string, number>(sessionIds.map((id) => [id, 0]));
	for (const { sessionId } of participants) {
		registeredBySession.set(sessionId, (registeredBySession.get(sessionId) ?? 0) + 1);
	}

	return {
		entries: participants.map(rosterEntryFrom),
		counters: [...registeredBySession].map(([sessionId, registered]) => ({
			sessionId,
			registered,
		})),
	};
}
