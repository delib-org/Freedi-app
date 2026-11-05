import { createHash } from 'crypto';
import type {
	TableAssignmentParticipant,
	TableAssignmentSettings,
	TableAssignmentTopic,
} from '@freedi/shared-types';

/**
 * Stable hash of everything a seating depends on: the topics (ids, caps,
 * order), each participant's preferences and position, and the settings the
 * engine reads. A published run is only valid while this still matches.
 * Names, titles and the position-question labels are deliberately left out:
 * they never change who sits where.
 */
export function computeInputHash(
	settings: Pick<TableAssignmentSettings, 'tableSize' | 'balanceTolerance'>,
	topics: readonly TableAssignmentTopic[],
	participants: readonly TableAssignmentParticipant[],
): string {
	const canonical = {
		tableSize: settings.tableSize,
		balanceTolerance: settings.balanceTolerance,
		topics: [...topics]
			.sort((a, b) => a.order - b.order || a.topicId.localeCompare(b.topicId))
			.map((t) => [t.topicId, t.maxTables ?? null, t.order]),
		participants: [...participants]
			.sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0))
			.map((p) => [p.uid, p.preferences, p.position ?? null]),
	};

	return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
