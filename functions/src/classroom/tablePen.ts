import {
	everyoneSpoke,
	everyoneWrote,
	proposalsMaxTurns,
	proposalsTurnOf,
	wroteAlready,
} from '@freedi/shared-types';
import type { ClassTable, ClassTableAction } from '@freedi/shared-types';
import { ClassroomError } from './classroomErrors';
import type { TransitionContext } from './tableGuards';

/**
 * Proposals, at write: one pen per table (Trello 6KEXvzXK, fJij2wMx; IA
 * join-class-proposals-flow §5). Only the pen holder writes; the first tap on
 * "I want to write" wins; a send or a pass frees the pen and counts the
 * tablemate as written; once every tablemate with a phone wrote, the table
 * moves to rate by itself. Pure parts of the state machine of
 * tableTransitions.ts: the guards and the transitions. This file imports the
 * guards' types only, so tableGuards.ts can import it back.
 */

type PenCtx = Pick<
	TransitionContext,
	'actorUid' | 'isAdmin' | 'lessonStep' | 'unlimitedProposals' | 'writeBlocked'
>;

/** A copy of the table with no pen state: a table that enters write (or leaves it) starts clean. */
export function withoutPen(table: ClassTable): ClassTable {
	const copy: ClassTable = { ...table };
	delete copy.writerUid;
	delete copy.writtenUids;

	return copy;
}

function withoutWriter(table: ClassTable): ClassTable {
	const copy: ClassTable = { ...table };
	delete copy.writerUid;

	return copy;
}

/** The table moves to rate when every tablemate with a phone wrote (or passed). */
export function movedToRateIfAllWrote(table: ClassTable): ClassTable {
	if (table.step !== 'write' || !everyoneWrote(table)) return table;

	return { ...withoutWriter(table), step: 'rate' };
}

function assertProposalsWriting(table: ClassTable, ctx: Pick<PenCtx, 'lessonStep'>): void {
	if (ctx.lessonStep !== 'proposals') {
		throw new ClassroomError(
			'failed-precondition',
			'The pen is only used at Proposals',
			'not-writing',
		);
	}
	if (table.step !== 'write') {
		throw new ClassroomError('failed-precondition', 'The table is not writing', 'not-writing');
	}
}

/** A seated tablemate (not a teacher) takes the pen, once, while it is free. */
export function assertMayClaimPen(table: ClassTable, ctx: PenCtx): void {
	if (!table.memberUids.includes(ctx.actorUid)) {
		throw new ClassroomError('permission-denied', 'You are not seated at this table');
	}
	assertProposalsWriting(table, ctx);
	// The same conditions classPostProposal enforces: nobody may take a pen they could not use.
	if (ctx.writeBlocked === 'vote-running') {
		throw new ClassroomError('failed-precondition', 'The vote has opened', 'vote-running');
	}
	if (ctx.writeBlocked === 'no-challenge') {
		throw new ClassroomError('failed-precondition', 'The lesson has no challenge', 'not-writing');
	}
	if (table.writerUid) {
		throw new ClassroomError('failed-precondition', 'Someone else holds the pen', 'pen-taken');
	}
	if (wroteAlready(table, ctx.actorUid) && !ctx.unlimitedProposals) {
		throw new ClassroomError('failed-precondition', 'You already wrote', 'already-written');
	}
}

/**
 * At Proposals the students never move the table by themselves between write and rate (it
 * moves when everyone wrote, or the teacher moves it), and a tablemate moves it to write only
 * once every round is spoken. A teacher is not checked here.
 */
export function assertProposalsStudentMove(
	table: ClassTable,
	action: ClassTableAction,
	ctx: Pick<TransitionContext, 'now' | 'proposalsTurns'>,
): void {
	if (action.action === 'toRate') {
		throw new ClassroomError('permission-denied', 'The table moves to rating by itself');
	}
	if (action.action !== 'toWrite') return;
	const turnsLeft =
		proposalsTurnOf(table) <
		proposalsMaxTurns(table, {
			statementSettings: { proposalsTurns: ctx.proposalsTurns },
		});
	if (turnsLeft || !everyoneSpoke(table, ctx.now)) {
		throw new ClassroomError('failed-precondition', 'Not everyone has spoken', 'talk-not-over');
	}
}

/** The target of a pass: the caller, or (a teacher only, who must name one) a tablemate. */
function passTarget(
	action: Extract<ClassTableAction, { action: 'passWriting' }>,
	ctx: PenCtx,
): string {
	if (ctx.isAdmin) {
		if (!action.uid) throw new ClassroomError('invalid-argument', 'Name the tablemate who passes');

		return action.uid;
	}
	if (action.uid !== undefined && action.uid !== ctx.actorUid) {
		throw new ClassroomError('permission-denied', 'Only a teacher can pass for someone else');
	}

	return ctx.actorUid;
}

/** A tablemate passes their own writing; a teacher names who passes (this frees a stuck pen). */
export function assertMayPassWriting(
	table: ClassTable,
	action: Extract<ClassTableAction, { action: 'passWriting' }>,
	ctx: PenCtx,
): void {
	const target = passTarget(action, ctx);
	if (!ctx.isAdmin && !table.memberUids.includes(ctx.actorUid)) {
		throw new ClassroomError('permission-denied', 'You are not seated at this table');
	}
	if (!table.memberUids.includes(target)) {
		throw new ClassroomError('invalid-argument', 'Only a tablemate can pass');
	}
	assertProposalsWriting(table, ctx);
	if (wroteAlready(table, target) && table.writerUid !== target) {
		throw new ClassroomError('failed-precondition', 'Already wrote', 'already-written');
	}
}

/** The pen holder gives the pen back (they left the screen); anyone else is refused. */
export function assertMayReleasePen(table: ClassTable, ctx: PenCtx): void {
	if (!table.memberUids.includes(ctx.actorUid)) {
		throw new ClassroomError('permission-denied', 'You are not seated at this table');
	}
	assertProposalsWriting(table, ctx);
	if (table.writerUid !== ctx.actorUid) {
		throw new ClassroomError('failed-precondition', 'You do not hold the pen', 'no-pen');
	}
}

/** Give the pen back: free again, and the holder has not written. */
export function releasePen(base: ClassTable): ClassTable {
	return withoutWriter(base);
}

/** "I want to write": the pen is theirs. */
export function claimPen(base: ClassTable, actorUid: string): ClassTable {
	return { ...base, writerUid: actorUid };
}

/** Pass writing: the target counts as written, and frees the pen when they held it. */
export function passWriting(
	base: ClassTable,
	action: Extract<ClassTableAction, { action: 'passWriting' }>,
	ctx: PenCtx,
): ClassTable {
	const target = passTarget(action, ctx);
	const freed = base.writerUid === target ? withoutWriter(base) : base;
	const written = wroteAlready(freed, target)
		? (freed.writtenUids ?? [])
		: [...(freed.writtenUids ?? []), target];

	return movedToRateIfAllWrote({ ...freed, writtenUids: written });
}

/**
 * A proposal of `uid` landed (classPostProposal): the pen comes back free and
 * they count as written. A table that is not at write is left alone (a late
 * send changes nothing there).
 */
export function afterProposalSent(table: ClassTable, uid: string, now: number): ClassTable {
	if (table.step !== 'write' || !table.memberUids.includes(uid)) return table;
	const freed = table.writerUid === uid ? withoutWriter(table) : table;
	const written = wroteAlready(freed, uid)
		? (freed.writtenUids ?? [])
		: [...(freed.writtenUids ?? []), uid];

	return { ...movedToRateIfAllWrote({ ...freed, writtenUids: written }), updatedAt: now };
}

/**
 * A proposal may be posted by a student at Proposals only while their table is
 * at write and they hold the pen. Anything else (a stale tab that never took
 * the pen, a tap during Talk) is refused with `no-pen`.
 */
export function assertHoldsPen(table: ClassTable, uid: string): void {
	if (table.step === 'write' && table.writerUid === uid) return;
	throw new ClassroomError(
		'failed-precondition',
		'Take the pen before sending a proposal',
		'no-pen',
	);
}

/** A tablemate who left (or was moved) no longer holds the pen or gates the end of writing. */
export function withoutWriterMember(table: ClassTable, uid: string): ClassTable {
	const next = table.writerUid === uid ? withoutWriter(table) : { ...table };
	if (next.writtenUids) next.writtenUids = next.writtenUids.filter((m) => m !== uid);

	return next;
}
