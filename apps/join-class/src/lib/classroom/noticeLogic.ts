import type { LessonStepKey, TableStep } from '@freedi/shared-types';

/**
 * Pure side of the phone's one-time lines (IA 18.2): the teacher moved the
 * class back, restarted the turns, or restarted the vote. Compares what the
 * phone saw a moment ago with what it sees now.
 */

export interface NoticeSnapshot {
	stepIndex: number;
	stepKey: LessonStepKey;
	/** The student's own table; null when not seated. */
	tableTurn: number | null;
	tableStep: TableStep | null;
	tableAsked: number;
	tableUsed: number;
	/** The challenge question's ballot; null when none is frozen. */
	ballotFrozenAt: number | null;
	ballotClosedAt: number | null;
}

export type Notice =
	| { kind: 'back'; stepKey: LessonStepKey }
	| { kind: 'turns' }
	| { kind: 'vote' };

/** The line to show once, or null. The order is the order of importance. */
export function detectNotice(prev: NoticeSnapshot | null, next: NoticeSnapshot): Notice | null {
	if (!prev) return null;
	if (next.stepIndex < prev.stepIndex) return { kind: 'back', stepKey: next.stepKey };
	const hadTurns =
		prev.tableTurn !== null && (prev.tableTurn > 1 || prev.tableAsked > 0 || prev.tableUsed > 0);
	if (
		hadTurns &&
		next.tableTurn === 1 &&
		next.tableStep === 'pick' &&
		next.tableAsked === 0 &&
		next.tableUsed === 0
	) {
		return { kind: 'turns' };
	}
	if (
		prev.ballotClosedAt !== null &&
		next.ballotClosedAt === null &&
		next.ballotFrozenAt !== null &&
		next.ballotFrozenAt === prev.ballotFrozenAt
	) {
		return { kind: 'vote' };
	}

	return null;
}
