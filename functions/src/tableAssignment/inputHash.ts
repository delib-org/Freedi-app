import { createHash } from 'crypto';
import type {
	TableAssignmentParticipant,
	TableAssignmentSettings,
	TableAssignmentTopic,
} from '@freedi/shared-types';

type Answer = [string, readonly string[], number | null];

function canonicalAnswers(participants: readonly TableAssignmentParticipant[]): Answer[] {
	return [...participants]
		.sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0))
		.map((p) => [p.uid, p.preferences, p.position ?? null]);
}

function sha256(value: unknown): string {
	return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/**
 * Hash of who registered and what they answered, and nothing else. The preview
 * budget is keyed on this: were settings part of it, moving the tolerance a
 * little would buy fresh previews and locate each table's exact distance.
 */
export function computeAnswersHash(participants: readonly TableAssignmentParticipant[]): string {
	return sha256(canonicalAnswers(participants));
}

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
		participants: canonicalAnswers(participants),
	};

	return sha256(canonical);
}
