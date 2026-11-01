import { moveOnReached, moveOnPressers, proposalsTurnOf } from '@freedi/shared-types';
import type { ClassTable, ClassTableAction, LessonStepKey } from '@freedi/shared-types';
import { ClassroomError } from './classroomErrors';
import { answeredUids, isTableTalk, listOf } from './tableGuards';
import type { TransitionContext } from './tableGuards';

/**
 * "Move on" (Trello 1c8jfvA6, GdrAEIF9): the students move their own table on
 * when a tablemate left or a phone broke. Pure parts of the state machine of
 * tableTransitions.ts: the guard (who may press, when) and the transition (a
 * toggle of the press; the move when enough tablemates pressed).
 */

type MoveCtx = Pick<TransitionContext, 'lessonStep' | 'now'>;

function answeredAll(table: ClassTable, now: number): boolean {
	const done = answeredUids(table, now);

	return table.memberUids.every((uid) => done.has(uid));
}

/** Is there something to move on from? */
export function canMoveOn(table: ClassTable, ctx: MoveCtx): boolean {
	if (isTableTalk(table, ctx.lessonStep)) {
		// Only while a question is being answered: choosing / done tables have nothing to skip.
		return table.step === 'talk' && !!table.questionId && !answeredAll(table, ctx.now);
	}

	return ctx.lessonStep === 'proposals' && (table.step === 'pick' || table.step === 'talk');
}

/** A seated tablemate may press, while there is something to move on from. */
export function assertMayMoveOn(table: ClassTable, actorUid: string, ctx: MoveCtx): void {
	if (!table.memberUids.includes(actorUid)) {
		throw new ClassroomError('permission-denied', 'You are not seated at this table');
	}
	if (canMoveOn(table, ctx)) return;
	if (isTableTalk(table, ctx.lessonStep)) {
		throw new ClassroomError('failed-precondition', 'The table is not talking', 'not-talking');
	}
	if (ctx.lessonStep === 'proposals') {
		throw new ClassroomError('failed-precondition', 'The table already moved on', 'already-moved');
	}
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

/** The move itself; the presses reset. */
function movedOnTable(table: ClassTable, ctx: MoveCtx): ClassTable {
	const moved = isTableTalk(table, ctx.lessonStep) ? skipTalk(table, ctx.now) : skipToWrite(table);
	delete moved.moveOnUids;

	return moved;
}

/**
 * Membership shrank (a tablemate left or was moved): the smaller table may now have
 * enough presses and nobody would tap again. Moves it on, as `moveOn` does; unchanged
 * when the presses are not enough or there is nothing to move on from.
 */
export function moveOnIfReached(
	table: ClassTable,
	lessonStep: LessonStepKey | null | undefined,
	now: number,
): ClassTable {
	const ctx = { lessonStep, now };
	if (!moveOnReached(table) || !canMoveOn(table, ctx)) return table;

	return { ...movedOnTable(table, ctx), updatedAt: now };
}

/**
 * Toggle the caller's press; when enough tablemates pressed the table moves on and the presses
 * reset. A press that finds the threshold already reached moves the table instead of withdrawing.
 * A tap that names an earlier turn (`fromTurn`, `fromProposalsTurn`) is ignored.
 */
export function moveOn(
	base: ClassTable,
	ctx: TransitionContext,
	action: Extract<ClassTableAction, { action: 'moveOn' }>,
): ClassTable {
	if (action.fromTurn !== undefined && action.fromTurn !== base.turn) return base;
	if (
		action.fromProposalsTurn !== undefined &&
		action.fromProposalsTurn !== proposalsTurnOf(base)
	) {
		return base;
	}
	if (moveOnReached(base)) return movedOnTable(base, ctx);
	const pressed = moveOnPressers(base);
	const presses = pressed.includes(ctx.actorUid)
		? pressed.filter((uid) => uid !== ctx.actorUid)
		: [...pressed, ctx.actorUid];
	const counted: ClassTable = { ...base, moveOnUids: presses };

	return moveOnReached(counted) ? movedOnTable(base, ctx) : counted;
}
