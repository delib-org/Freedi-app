import { RoomSettings } from '@freedi/shared-types';

/**
 * The latest active room split per answer of one question. Room settings are
 * keyed by `topParentId` = the question and `statementId` = the answer; an
 * older active split of the same answer is superseded by the newer one.
 */
export function activeSplitsOf(
	settings: ReadonlyArray<RoomSettings>,
	questionId: string,
): RoomSettings[] {
	const latestByAnswer = new Map<string, RoomSettings>();
	settings
		.filter((s) => s.topParentId === questionId && s.status === 'active')
		.forEach((s) => {
			const existing = latestByAnswer.get(s.statementId);
			if (!existing || s.createdAt > existing.createdAt) latestByAnswer.set(s.statementId, s);
		});

	return [...latestByAnswer.values()];
}

/** How many rooms a question's answers are split into right now. */
export function countActiveRooms(
	settings: ReadonlyArray<RoomSettings>,
	questionId: string,
): number {
	return activeSplitsOf(settings, questionId).reduce((sum, s) => sum + s.totalRooms, 0);
}
