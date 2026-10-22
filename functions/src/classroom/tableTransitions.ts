import { SPEAK_SECONDS, notAskedUids } from '@freedi/shared-types';
import type { ClassTable, ClassTableAction, TableStep } from '@freedi/shared-types';
import { ClassroomError } from './classroomErrors';

/**
 * Pure state machine of one table (`classTableStep`). Given the table, the
 * action and who asks, returns the table's next state (a whole document: the
 * callable writes it with `set`, so optional fields that reset simply vanish).
 *
 * A turn: pick (asker picks a question) -> talk (each tablemate speaks for
 * SPEAK_SECONDS) -> write -> rate -> the next turn (back to pick). Every
 * tablemate with a device asks once (`askedUids`). At `rate` the first
 * tablemate who has not asked taps to claim the next turn (`nextTurn` by a
 * member: first tap wins, the transaction refuses the second); the asker
 * cannot hand the turn on, and a teacher's `nextTurn` gives it to the first
 * tablemate who has not asked. The Proposals step reuses talk -> write ->
 * rate with no question.
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
	nextTurn: ['rate'],
	passAsker: ['pick'],
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

export function actorRole(table: ClassTable, ctx: TransitionContext): ActorRole | null {
	if (ctx.isAdmin) return 'admin';
	if (table.askerUid && table.askerUid === ctx.actorUid) return 'asker';
	if (table.memberUids.includes(ctx.actorUid)) return 'member';

	return null;
}

/** The current speaker's minute is over (or nobody holds the floor yet). */
export function speakerTimeOver(table: ClassTable, now: number): boolean {
	return typeof table.speakerEndsAt !== 'number' || table.speakerEndsAt <= now;
}

/** Everyone at the table has spoken (the current speaker counts once their minute is over). */
export function everyoneSpoke(table: ClassTable, now: number): boolean {
	const spoken = new Set(table.spokenUids);
	if (table.speakerUid && typeof table.speakerEndsAt === 'number' && table.speakerEndsAt <= now) {
		spoken.add(table.speakerUid);
	}

	return table.memberUids.length > 0 && table.memberUids.every((uid) => spoken.has(uid));
}

/**
 * May this actor run this action now? The asker holds the table's controls;
 * a plain tablemate may pick the next speaker once the current minute is over
 * ("הבא בתור", so a table is never stuck on a missing asker) and may leave
 * talk for write once everyone has spoken ("סיימנו, לכתוב").
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
	if (action.action === 'nextTurn') {
		assertMayClaimTurn(role, table, actorUid, action.fromTurn);

		return;
	}
	if (role === 'asker') return;
	if (role === 'member') {
		if (action.action === 'nextSpeaker' && table.speakerUid && speakerTimeOver(table, now)) return;
		if (action.action === 'toWrite' && table.step === 'talk' && everyoneSpoke(table, now)) return;
	}
	throw new ClassroomError('permission-denied', "Only the table's asker or a teacher can do this");
}

/**
 * A tablemate (never the asker) may claim the next turn from `rate`, once, if
 * they have not asked yet. Checked in this order so a forged or stale tap gets
 * the most telling refusal: already asked, then step moved (someone won).
 */
function assertMayClaimTurn(
	role: ActorRole | null,
	table: ClassTable,
	actorUid: string,
	fromTurn: number | undefined,
): void {
	if (role === 'asker') {
		throw new ClassroomError('permission-denied', 'The asker cannot hand the turn on');
	}
	if ((table.askedUids ?? []).includes(actorUid)) {
		throw new ClassroomError('permission-denied', 'You have already asked', 'already-asked');
	}
	if (table.step !== 'rate' || (fromTurn !== undefined && fromTurn !== table.turn)) {
		throw new ClassroomError(
			'failed-precondition',
			'Another tablemate already started the next turn',
			'turn-claimed',
		);
	}
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
	const { questionId: _q, speakerUid: _s, speakerEndsAt: _e, ...rest } = table;
	void _q;
	void _s;
	void _e;

	return { ...rest, spokenUids: [], writingLocked: false };
}

function withoutSpeaker(table: ClassTable): ClassTable {
	const { speakerUid: _s, speakerEndsAt: _e, ...rest } = table;
	void _s;
	void _e;

	return rest;
}

/** `askedUids` with the current asker added: their turn is over once the table moves on. */
function withAsker(table: ClassTable): string[] {
	const asked = table.askedUids ?? [];

	return table.askerUid && !asked.includes(table.askerUid) ? [...asked, table.askerUid] : asked;
}

/** Next asker after `current` in seating order; the first member when there is no current one. */
export function nextAsker(memberUids: string[], current: string | null): string | null {
	if (memberUids.length === 0) return null;
	const i = current ? memberUids.indexOf(current) : -1;

	return memberUids[(i + 1) % memberUids.length];
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
		case 'toTalk':
			return { ...withoutSpeaker(base), step: 'talk', spokenUids: [] };
		case 'nextSpeaker': {
			const { uid } = action;
			if (!table.memberUids.includes(uid)) {
				throw new ClassroomError('invalid-argument', 'The next speaker must sit at this table');
			}
			const spoken =
				table.speakerUid && !table.spokenUids.includes(table.speakerUid)
					? [...table.spokenUids, table.speakerUid]
					: table.spokenUids;

			return {
				...base,
				speakerUid: uid,
				speakerEndsAt: ctx.now + SPEAK_SECONDS * 1000,
				spokenUids: spoken,
			};
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
		case 'nextTurn': {
			// A tablemate claims the turn for themselves; a teacher gives it to the
			// first tablemate who has not asked (nobody left: the table is done).
			const claimed = role === 'admin' ? notAskedUids(table)[0] : ctx.actorUid;
			if (!claimed) {
				throw new ClassroomError('failed-precondition', 'Everyone has already asked', 'all-asked');
			}

			return {
				...withoutTurnFields(base),
				step: 'pick',
				turn: table.turn + 1,
				askerUid: claimed,
				askedUids: withAsker(table),
				writingMode: 'each',
			};
		}
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
