import type { ClassTable, LessonStepKey } from '@freedi/shared-types';
import { moveOnIfReached } from './tableMoveOn';

/**
 * Pure membership edits behind `classMoveStudent`. The callable keeps the
 * table docs and the student's `subscription.tableId` consistent by writing
 * the results of these in one transaction.
 */

/**
 * Take `uid` off a table. When the asker leaves, nobody asks (`askerUid` null):
 * at `pick` that is a volunteer moment (the question they chose is free again),
 * at `talk` the turn continues askerless (any tablemate moves it on, IA 16.7
 * E8). A speaker who leaves loses the floor. The leaver stays in `askedUids`
 * and `passedAskingUids` (per table doc): rejoining this table cannot give them
 * a second turn, while a table they move to starts them as not yet asked. They
 * leave this turn's `spokenUids` / `passedSpeakingUids`. Every derivation
 * reads these lists through the current `memberUids`.
 */
export function removeMember(
	table: ClassTable,
	uid: string,
	now: number,
	lessonStep?: LessonStepKey | null,
): ClassTable {
	if (!table.memberUids.includes(uid)) return table;
	const next: ClassTable = {
		...table,
		memberUids: table.memberUids.filter((m) => m !== uid),
		spokenUids: table.spokenUids.filter((m) => m !== uid),
		updatedAt: now,
	};
	if (table.passedSpeakingUids) {
		next.passedSpeakingUids = table.passedSpeakingUids.filter((m) => m !== uid);
	}
	if (table.askerUid === uid) {
		next.askerUid = null;
		if (table.step === 'pick' && table.questionId) {
			delete next.questionId;
			next.usedQuestionIds = table.usedQuestionIds.filter((id) => id !== table.questionId);
		}
	}
	if (next.speakerUid === uid) {
		delete next.speakerUid;
		delete next.speakerEndsAt;
		delete next.speakerMs;
	}
	if (table.moveOnUids) next.moveOnUids = table.moveOnUids.filter((m) => m !== uid);

	// A smaller table needs fewer "move on" presses: it may be enough now, and nobody would tap again.
	return moveOnIfReached(next, lessonStep, now);
}

/** Seat `uid` at a table (last in seating order). They are not yet asked and never become the asker by sitting down. */
export function addMember(table: ClassTable, uid: string, now: number): ClassTable {
	if (table.memberUids.includes(uid)) return table;

	return { ...table, memberUids: [...table.memberUids, uid], updatedAt: now };
}
