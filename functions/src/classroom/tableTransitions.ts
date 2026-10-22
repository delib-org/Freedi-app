import { SPEAK_SECONDS, everyoneSpoke, notAskedUids, speakerTimeOver } from '@freedi/shared-types';
import type { ClassTable, ClassTableAction, TableStep } from '@freedi/shared-types';
import { ClassroomError } from './classroomErrors';

export { everyoneSpoke, speakerTimeOver };

/**
 * Pure state machine of one table (`classTableStep`). Given the table, the
 * action and who asks, returns the table's next state (a whole document: the
 * callable writes it with `set`, so optional fields that reset simply vanish).
 *
 * Table talk turn (IA 16 rev 2): nobody asks until a student who has not asked
 * claims the turn ("אני אשאל": `nextTurn` by a member, first transaction wins)
 * -> pick (the asker chooses a question) -> talk (every tablemate speaks for
 * SPEAK_SECONDS, the asker too; a minute can be passed) -> the next claim.
 * `askedUids` gains the asker at `toTalk`; a student may pass on asking
 * (`passedAskingUids`, kept all lesson) or on a minute (`passedSpeakingUids`,
 * cleared per turn). A teacher's `nextTurn` opens a volunteer moment (no asker).
 * The Proposals step reuses talk -> write -> rate with no question.
 *
 * A timer ending never advances anything: `speakerEndsAt` is only a moment
 * the devices count down to. It changes WHO may act (any tablemate once the
 * minute is over, IA §2.4 / §11.3), never the step.
 */

export type ActorRole = 'admin' | 'asker' | 'member';

export interface TransitionContext {
	actorUid: string;
	/** Admin of the workspace (teacher / co-teacher). */
	isAdmin: boolean;
	/** Server clock, epoch ms. */
	now: number;
}

/** From which steps the asker (or a tablemate, where allowed) may run each action. */
export const ALLOWED_FROM: Record<ClassTableAction['action'], readonly TableStep[]> = {
	pickQuestion: ['pick'],
	toTalk: ['pick'],
	nextSpeaker: ['talk'],
	toWrite: ['pick', 'talk'],
	setWritingMode: ['pick', 'talk', 'write'],
	toRate: ['talk', 'write'],
	// pick: V1 (nobody asks); talk: V2 (everyone spoke); rate: a table that was mid-turn before v2.
	nextTurn: ['pick', 'talk', 'rate'],
	passAsker: ['pick'],
	passAsking: ['pick', 'talk', 'write', 'rate'],
	passSpeaking: ['talk'],
};

/**
 * Admins (the teacher's console: "לכתיבה · לדירוג", moving a stuck table) may
 * jump a table to talk / write / rate or start the next turn from any step.
 * Actions whose meaning depends on the step (pick a question, choose the next
 * speaker, change the writing mode) keep their preconditions for everyone.
 */
const ADMIN_FROM_ANY_STEP: ReadonlySet<ClassTableAction['action']> = new Set([
	'toTalk',
	'toWrite',
	'toRate',
	'nextTurn',
]);

/** Teacher-only actions: the asker and tablemates never run them. */
const ADMIN_ONLY: ReadonlySet<ClassTableAction['action']> = new Set(['passAsker']);

/** Moves a plain tablemate may run when nobody asks (the asker left): IA 16.7 E8. */
const ASKERLESS_MEMBER_MOVES: ReadonlySet<ClassTableAction['action']> = new Set([
	'nextSpeaker',
	'toWrite',
	'toRate',
]);

export function actorRole(table: ClassTable, ctx: TransitionContext): ActorRole | null {
	if (ctx.isAdmin) return 'admin';
	if (table.askerUid && table.askerUid === ctx.actorUid) return 'asker';
	if (table.memberUids.includes(ctx.actorUid)) return 'member';

	return null;
}

function listOf(uids: string[] | undefined): string[] {
	return uids ?? [];
}

/**
 * A tablemate may claim the turn ("אני אשאל") at two moments, once, if they
 * have not asked or passed: V1 (`pick`, nobody asks) and V2 (`talk`, everyone
 * spoke); a table left at `rate` before v2 still allows it. Checked in this
 * order so a forged or stale tap gets the most telling refusal.
 */
function assertMayClaimTurn(
	table: ClassTable,
	actorUid: string,
	fromTurn: number | undefined,
	now: number,
): void {
	if (listOf(table.askedUids).includes(actorUid)) {
		throw new ClassroomError('permission-denied', 'You have already asked', 'already-asked');
	}
	if (listOf(table.passedAskingUids).includes(actorUid)) {
		throw new ClassroomError('permission-denied', 'You passed on asking', 'already-passed');
	}
	const tableMovedOn = fromTurn !== undefined && fromTurn !== table.turn;
	const alreadyClaimed = table.step === 'pick' && table.askerUid !== null;
	if (tableMovedOn || alreadyClaimed) {
		throw new ClassroomError(
			'failed-precondition',
			'Another tablemate already took the turn',
			'turn-claimed',
		);
	}
	if (table.step === 'talk' && !everyoneSpoke(table, now)) {
		throw new ClassroomError(
			'failed-precondition',
			'The table has not finished talking',
			'talk-not-over',
		);
	}
}

/** A member passes only for themselves; the target checks need the table, so they run in the transition. */
function assertMayPassAsking(action: ClassTableAction, actorUid: string): void {
	if (action.action === 'passAsking' && action.uid !== undefined && action.uid !== actorUid) {
		throw new ClassroomError('permission-denied', 'Only a teacher can pass for someone else');
	}
}

/** The speaker passes their own minute; the asker passes on their behalf. */
function assertMayPassSpeaking(role: ActorRole | null, table: ClassTable, actorUid: string): void {
	if (role === 'asker' || actorUid === table.speakerUid) return;
	throw new ClassroomError(
		'permission-denied',
		'Only the speaker, the asker or a teacher can pass a minute',
		'not-speaker',
	);
}

/**
 * May this actor run this action now? The asker holds the table's controls;
 * a plain tablemate may pick the next speaker once the current minute is over
 * ("הבא בתור", so a table is never stuck) and, at a table nobody asks at (the
 * asker left), run the asker's moves.
 */
function assertMayAct(
	role: ActorRole | null,
	action: ClassTableAction,
	table: ClassTable,
	now: number,
	actorUid: string,
): void {
	if (role === 'admin') return;
	if (ADMIN_ONLY.has(action.action)) {
		throw new ClassroomError('permission-denied', 'Only a teacher can do this');
	}
	switch (action.action) {
		case 'nextTurn':
			assertMayClaimTurn(table, actorUid, action.fromTurn, now);

			return;
		case 'passAsking':
			assertMayPassAsking(action, actorUid);

			return;
		case 'passSpeaking':
			assertMayPassSpeaking(role, table, actorUid);

			return;
		default:
			break;
	}
	if (role === 'asker') return;
	if (role === 'member') {
		if (action.action === 'nextSpeaker' && table.speakerUid && speakerTimeOver(table, now)) return;
		if (action.action === 'toWrite' && table.step === 'talk' && everyoneSpoke(table, now)) return;
		const askerless = table.askerUid === null && (table.step === 'talk' || table.step === 'write');
		if (askerless && ASKERLESS_MEMBER_MOVES.has(action.action)) return;
		// A table that reaches Proposals without a turn (everyone passed, or none started) sits at pick with
		// nobody asking: its tablemates must still be able to leave for writing.
		if (table.askerUid === null && table.step === 'pick' && action.action === 'toWrite') return;
	}
	throw new ClassroomError('permission-denied', "Only the table's asker or a teacher can do this");
}

function assertFromStep(role: ActorRole | null, action: ClassTableAction, table: ClassTable): void {
	if (role === 'admin' && ADMIN_FROM_ANY_STEP.has(action.action)) return;
	if (!ALLOWED_FROM[action.action].includes(table.step)) {
		throw new ClassroomError(
			'failed-precondition',
			`${action.action} is not allowed while the table is at '${table.step}'`,
		);
	}
}

/** Strip the per-speaker / per-question fields; used when a turn resets. */
function withoutTurnFields(table: ClassTable): ClassTable {
	const {
		questionId: _q,
		speakerUid: _s,
		speakerEndsAt: _e,
		passedSpeakingUids: _p,
		...rest
	} = table;
	void _q;
	void _s;
	void _e;
	void _p;

	return { ...rest, spokenUids: [], writingLocked: false };
}

function withoutSpeaker(table: ClassTable): ClassTable {
	const { speakerUid: _s, speakerEndsAt: _e, ...rest } = table;
	void _s;
	void _e;

	return rest;
}

function withoutPassedSpeaking(table: ClassTable): ClassTable {
	const { passedSpeakingUids: _p, ...rest } = table;
	void _p;

	return rest;
}

/** `askedUids` with the current asker added (a table left mid-turn before v2 never added them at toTalk). */
function withAsker(table: ClassTable): string[] {
	const asked = listOf(table.askedUids);

	return table.askerUid && !asked.includes(table.askerUid) ? [...asked, table.askerUid] : asked;
}

/** A turn that starts: step pick, turn + 1, the turn fields cleared. */
function startedTurn(base: ClassTable, table: ClassTable, askerUid: string | null): ClassTable {
	return {
		...withoutTurnFields(base),
		step: 'pick',
		turn: table.turn + 1,
		askerUid,
		// An asker still choosing has not asked: leaving pick does not count as their turn.
		askedUids: table.step === 'pick' ? listOf(table.askedUids) : withAsker(table),
		writingMode: 'each',
	};
}

function nextTurn(
	table: ClassTable,
	base: ClassTable,
	role: ActorRole | null,
	actorUid: string,
): ClassTable {
	if (role !== 'admin') {
		// V1: the claimer becomes the asker and the turn stays; V2 (or a leftover rate): a new turn.
		return table.step === 'pick'
			? { ...base, askerUid: actorUid }
			: startedTurn(base, table, actorUid);
	}
	// A teacher opens a volunteer moment. An asker still at pick has not asked, so they stay eligible.
	const eligible = notAskedUids({
		...table,
		askerUid: table.step === 'pick' ? null : table.askerUid,
	});
	if (eligible.length === 0) {
		throw new ClassroomError('failed-precondition', 'Everyone has already asked', 'all-asked');
	}

	return startedTurn(base, table, null);
}

function passAsking(
	table: ClassTable,
	base: ClassTable,
	action: ClassTableAction,
	ctx: TransitionContext,
): ClassTable {
	const named = action.action === 'passAsking' ? action.uid : undefined;
	if (ctx.isAdmin && !named) {
		throw new ClassroomError('invalid-argument', 'Name the tablemate who passes');
	}
	const target = named ?? ctx.actorUid;
	if (!table.memberUids.includes(target)) {
		throw new ClassroomError('invalid-argument', 'Only a tablemate can pass on asking');
	}
	if (listOf(table.askedUids).includes(target)) {
		throw new ClassroomError('permission-denied', 'Already asked', 'already-asked');
	}
	if (listOf(table.passedAskingUids).includes(target)) {
		throw new ClassroomError('permission-denied', 'Already passed on asking', 'already-passed');
	}
	const passedAskingUids = [...listOf(table.passedAskingUids), target];
	if (target !== table.askerUid) return { ...base, passedAskingUids };
	if (table.step !== 'pick') {
		throw new ClassroomError('failed-precondition', 'The asker can only pass while choosing');
	}
	// The asker passes while choosing: back to a volunteer moment, their question is free again.
	const { questionId: _q, ...rest } = base;
	void _q;

	return {
		...rest,
		askerUid: null,
		passedAskingUids,
		usedQuestionIds: table.usedQuestionIds.filter((id) => id !== table.questionId),
	};
}

function passSpeaking(table: ClassTable, base: ClassTable, now: number): ClassTable {
	const { speakerUid } = table;
	if (!speakerUid || speakerTimeOver(table, now)) {
		throw new ClassroomError('failed-precondition', 'The minute is over', 'minute-over');
	}
	const withSpeaker = (uids: string[] | undefined): string[] =>
		listOf(uids).includes(speakerUid) ? listOf(uids) : [...listOf(uids), speakerUid];

	return {
		...base,
		spokenUids: withSpeaker(table.spokenUids),
		passedSpeakingUids: withSpeaker(table.passedSpeakingUids),
		speakerEndsAt: now,
	};
}

/**
 * Validate and apply one action. Question membership (the picked question is
 * a sub-question of the workspace) needs a read, so the callable checks it
 * before calling this; here only the table's own state is consulted.
 */
export function applyTableAction(
	table: ClassTable,
	action: ClassTableAction,
	ctx: TransitionContext,
): ClassTable {
	const role = actorRole(table, ctx);
	if (role === null) {
		throw new ClassroomError('permission-denied', 'You are not seated at this table');
	}
	assertMayAct(role, action, table, ctx.now, ctx.actorUid);
	assertFromStep(role, action, table);

	const base: ClassTable = { ...table, updatedAt: ctx.now };

	switch (action.action) {
		case 'pickQuestion': {
			const { questionId } = action;
			if (questionId !== table.questionId && table.usedQuestionIds.includes(questionId)) {
				throw new ClassroomError(
					'failed-precondition',
					'This question was already asked at this table',
				);
			}
			// A re-pick inside the same turn frees the question picked before it.
			const used = table.usedQuestionIds.filter((id) => id !== table.questionId);

			return { ...base, questionId, usedQuestionIds: [...used, questionId] };
		}
		case 'toTalk': {
			if (role !== 'admin' && !table.questionId) {
				throw new ClassroomError('failed-precondition', 'Choose a question first', 'no-question');
			}
			const talk: ClassTable = {
				...withoutPassedSpeaking(withoutSpeaker(base)),
				step: 'talk',
				spokenUids: [],
			};

			// The asker has asked once their turn reaches talk (a teacher's jump with no question is no turn).
			return table.questionId ? { ...talk, askedUids: withAsker(table) } : talk;
		}
		case 'nextSpeaker': {
			const { uid } = action;
			if (!table.memberUids.includes(uid)) {
				throw new ClassroomError('invalid-argument', 'The next speaker must sit at this table');
			}
			const spoken =
				table.speakerUid && !table.spokenUids.includes(table.speakerUid)
					? [...table.spokenUids, table.speakerUid]
					: table.spokenUids;
			const next: ClassTable = {
				...base,
				speakerUid: uid,
				speakerEndsAt: ctx.now + SPEAK_SECONDS * 1000,
				spokenUids: spoken,
			};
			// A speaker who passed and is called again: the chip reads spoken, not passed.
			if (listOf(table.passedSpeakingUids).includes(uid)) {
				next.passedSpeakingUids = listOf(table.passedSpeakingUids).filter((m) => m !== uid);
			}

			return next;
		}
		case 'toWrite': {
			// The last speaker is done once the table moves on.
			const spoken =
				table.speakerUid && !table.spokenUids.includes(table.speakerUid)
					? [...table.spokenUids, table.speakerUid]
					: table.spokenUids;

			return { ...withoutSpeaker(base), step: 'write', spokenUids: spoken };
		}
		case 'setWritingMode':
			if (table.writingLocked) {
				throw new ClassroomError(
					'failed-precondition',
					'The writing mode is locked after the first send',
				);
			}

			return { ...base, writingMode: action.mode };
		case 'toRate':
			return { ...withoutSpeaker(base), step: 'rate' };
		case 'nextTurn':
			return nextTurn(table, base, role, ctx.actorUid);
		case 'passAsking':
			return passAsking(table, base, action, ctx);
		case 'passSpeaking':
			return passSpeaking(table, base, ctx.now);
		case 'passAsker': {
			const { uid } = action;
			if (!notAskedUids(table).includes(uid)) {
				throw new ClassroomError(
					'invalid-argument',
					'The turn can only pass to a tablemate who has not asked yet',
				);
			}

			return { ...base, askerUid: uid };
		}
		default: {
			const unknown: never = action;
			throw new ClassroomError('invalid-argument', `Unknown action ${JSON.stringify(unknown)}`);
		}
	}
}
