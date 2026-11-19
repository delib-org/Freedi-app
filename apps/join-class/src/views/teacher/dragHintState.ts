import { isDragHintSeen, markDragHintSeen } from '@/lib/classroom/dragHint';
import { getUserState } from '@/lib/user';

/**
 * The teacher's "I have seen the drag hint" flag, for the console board. The storage rules are
 * in lib/classroom/dragHint.ts; this reads the signed-in teacher and remembers the answer for
 * the rest of the visit, so a blocked storage cannot make the hint come back after "Got it".
 */

let seenThisVisit = false;

function teacherUid(): string | null {
	return getUserState().user?.uid ?? null;
}

export function dragHintSeen(): boolean {
	return seenThisVisit || isDragHintSeen(teacherUid());
}

/** After "Got it", or after the first move of a student. */
export function markDragHintDone(): void {
	seenThisVisit = true;
	markDragHintSeen(teacherUid());
}
