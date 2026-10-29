import { moveOnReached, moveOnPressers } from '@freedi/shared-types';
import type { ClassTable } from '@freedi/shared-types';
import { ClassroomError } from './classroomErrors';
import { answeredUids, isTableTalk, listOf } from './tableGuards';
import type { TransitionContext } from './tableGuards';

/**
 * "Move on" (Trello 1c8jfvA6, GdrAEIF9): the students move their own table on
 * when a tablemate left or a phone broke. Pure parts of the state machine of
 * tableTransitions.ts: the guard (who may press, when) and the transition (a
 * toggle of the press; the move when enough tablemates pressed).
 */

/** A seated tablemate may press, while there is something to move on from. */
export function assertMayMoveOn(
	table: ClassTable,
	actorUid: string,
	ctx: Pick<TransitionContext, 'lessonStep' | 'now'>,
): void {
	if (!table.memberUids.includes(actorUid)) {
		throw new ClassroomError('permission-denied', 'You are not seated at this table');
	}
	if (isTableTalk(table, ctx.lessonStep)) {
		// Only while a question is being answered: choosing / done tables have nothing to skip.
		if (table.step !== 'talk' || !table.questionId || answeredAll(table, ctx.now)) {
			throw new ClassroomError('failed-precondition', 'The table is not talking', 'not-talking');
		}

		return;
	}
	if (ctx.lessonStep === 'proposals' && table.step !== 'pick' && table.step !== 'talk') {
		throw new ClassroomError('failed-precondition', 'The table already moved on', 'already-moved');
	}
}

function answeredAll(table: ClassTable, now: number): boolean {
	const done = answeredUids(table, now);

	return table.memberUids.every((uid) => done.has(uid));
}

/** Table talk: everyone who has not answered counts as passed, so the table is choosing again. */
function skipTalk(table: ClassTable, now: number): ClassTable {
	const done = answeredUids(table, now);
	const skipped = table.memberUids.filter((uid) => !done.has(uid) && uid !== table.speakerUid);
	const spoken = new Set([...table.spokenUids, ...skipped]);
	// A running minute is cut short as answered: the speaker did speak.
	if (table.speakerUid) spoken.add(table.speakerUid);
	const passed = new Set([...listOf(table.passedSpeakingUids), ...skipped]);
	const next: ClassTable = { ...table, spokenUids: [...spoken], passedSpeakingUids: [...passed] };
	delete next.speakerUid;
	delete next.speakerEndsAt;
	delete next.speakerMs;

	return next;
}

/** Proposals: the table leaves talk for writing, as `toWrite` does. */
function skipToWrite(table: ClassTable): ClassTable {
	const spoken =
		table.speakerUid && !table.spokenUids.includes(table.speakerUid)
			? [...table.spokenUids, table.speakerUid]
			: table.spokenUids;
	const next: ClassTable = { ...table, step: 'write', spokenUids: spoken };
	delete next.speakerUid;
	delete next.speakerEndsAt;
	delete next.speakerMs;

	return next;
}

/** Toggle the caller's press; when enough tablemates pressed the table moves on and the presses reset. */
export function moveOn(base: ClassTable, ctx: TransitionContext): ClassTable {
	const pressed = moveOnPressers(base);
	const presses = pressed.includes(ctx.actorUid)
		? pressed.filter((uid) => uid !== ctx.actorUid)
		: [...pressed, ctx.actorUid];
	const counted: ClassTable = { ...base, moveOnUids: presses };
	if (!moveOnReached(counted)) return counted;
	const moved = isTableTalk(base, ctx.lessonStep) ? skipTalk(base, ctx.now) : skipToWrite(base);
	delete moved.moveOnUids;

	return moved;
}
