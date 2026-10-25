import { SPEAK_SECONDS, everyoneSpoke, notAskedUids, speakerTimeOver } from '@freedi/shared-types';
import type { ClassTable, ClassTableAction } from '@freedi/shared-types';
import { ClassroomError } from './classroomErrors';
import {
	ALLOWED_FROM,
	actorRole,
	answeredUids,
	assertFromStep,
	assertMayAct,
	isTableTalk,
	listOf,
} from './tableGuards';
import type { ActorRole, TransitionContext } from './tableGuards';

export { ALLOWED_FROM, actorRole };
export type { ActorRole, TransitionContext };

export { everyoneSpoke, speakerTimeOver };

/**
 * Pure state machine of one table (`classTableStep`). Given the table, the
 * action and who asks, returns the table's next state (a whole document: the
 * callable writes it with `set`, so optional fields that reset simply vanish).
 *
 * Table talk turn (IA 16 rev 3): every student who has not asked sees the
 * question list; the first to tap "I want to start" (`claimTurn`, first
 * transaction wins) becomes the asker, locks the question and moves the table
 * to talk in one write. Tablemates volunteer to answer (`claimSpeaker`, first
 * tap wins, SPEAK_SECONDS each, `finishSpeaking` ends one early); the asker
 * answers only after another tablemate did (`askerMayAnswer`). A pass is
 * `passSpeaking` (this question) or `passAsking` (the lesson, kept in
 * `passedAskingUids`). When everyone answered or passed the table is choosing
 * again, with no write. `nextTurn` and `nextSpeaker` are teacher-only here.
 * The Proposals step reuses talk -> write -> rate with no question.
 *
 * A timer ending never advances anything: `speakerEndsAt` is only a moment
 * the devices count down to. It changes WHO may act (any tablemate once the
 * minute is over, IA §2.4 / §11.3), never the step.
 */

/** A copy of `table` without the given optional keys. */
function omit(table: ClassTable, keys: readonly (keyof ClassTable)[]): ClassTable {
	const copy: ClassTable = { ...table };
	for (const key of keys) delete copy[key as 'questionId'];

	return copy;
}

/** Strip the per-speaker / per-question fields; used when a turn resets. */
function withoutTurnFields(table: ClassTable): ClassTable {
	const rest = omit(table, ['questionId', 'speakerUid', 'speakerEndsAt', 'passedSpeakingUids']);

	return { ...rest, spokenUids: [], writingLocked: false };
}

function withoutSpeaker(table: ClassTable): ClassTable {
	return omit(table, ['speakerUid', 'speakerEndsAt']);
}

function withoutPassedSpeaking(table: ClassTable): ClassTable {
	return omit(table, ['passedSpeakingUids']);
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
		// A question picked by an asker who never asked is free again.
		usedQuestionIds:
			table.step === 'pick' && table.questionId
				? table.usedQuestionIds.filter((id) => id !== table.questionId)
				: table.usedQuestionIds,
		writingMode: 'each',
	};
}

function nextTurn(table: ClassTable, base: ClassTable): ClassTable {
	// A teacher opens a pick. An asker still at pick has not asked, so they stay eligible.
	const eligible = notAskedUids({
		...table,
		askerUid: table.step === 'pick' ? null : table.askerUid,
	});
	if (eligible.length === 0) {
		throw new ClassroomError('failed-precondition', 'Everyone has already asked', 'all-asked');
	}

	return startedTurn(base, table, null);
}

/** "I want to start": the claimer asks, the question is locked, the table talks. One write. */
function claimTurn(
	table: ClassTable,
	base: ClassTable,
	action: Extract<ClassTableAction, { action: 'claimTurn' }>,
	actorUid: string,
): ClassTable {
	// From a finished talk (or a leftover write/rate) a new turn starts; from pick the turn stays.
	const started = startedTurn(base, table, actorUid);
	const turnBase: ClassTable = table.step === 'pick' ? { ...started, turn: table.turn } : started;
	const { questionId } = action;

	return {
		...turnBase,
		step: 'talk',
		askerUid: actorUid,
		questionId,
		usedQuestionIds: [...turnBase.usedQuestionIds.filter((id) => id !== questionId), questionId],
		askedUids: [...listOf(turnBase.askedUids).filter((id) => id !== actorUid), actorUid],
		spokenUids: [],
	};
}

/** `spokenUids` with the last speaker (whose minute is over or replaced) recorded. */
function withSpoken(table: ClassTable): string[] {
	return table.speakerUid && !table.spokenUids.includes(table.speakerUid)
		? [...table.spokenUids, table.speakerUid]
		: table.spokenUids;
}

/** "I want to answer": the floor for one minute; the previous speaker is recorded as answered. */
function claimSpeaker(
	table: ClassTable,
	base: ClassTable,
	actorUid: string,
	now: number,
): ClassTable {
	return {
		...base,
		spokenUids: withSpoken(table),
		speakerUid: actorUid,
		speakerEndsAt: now + SPEAK_SECONDS * 1000,
	};
}

function finishSpeaking(table: ClassTable, base: ClassTable, now: number): ClassTable {
	return { ...base, spokenUids: withSpoken(table), speakerEndsAt: now };
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

	return {
		...omit(base, ['questionId']),
		askerUid: null,
		passedAskingUids,
		usedQuestionIds: table.usedQuestionIds.filter((id) => id !== table.questionId),
	};
}

/** Proposals (and a speaker passing their own running minute): end the minute as passed. */
function passRunningMinute(table: ClassTable, base: ClassTable, now: number): ClassTable {
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

/** Table talk: pass this question (before speaking) for oneself, or for `uid` when a teacher names one. */
function passSpeaking(
	table: ClassTable,
	base: ClassTable,
	action: Extract<ClassTableAction, { action: 'passSpeaking' }>,
	ctx: TransitionContext,
): ClassTable {
	if (!isTableTalk(table, ctx.lessonStep)) return passRunningMinute(table, base, ctx.now);
	if (ctx.isAdmin && !action.uid) {
		throw new ClassroomError('invalid-argument', 'Name the tablemate who passes');
	}
	const target = action.uid ?? ctx.actorUid;
	if (!table.memberUids.includes(target)) {
		throw new ClassroomError('invalid-argument', 'Only a tablemate can pass');
	}
	const running = !!table.speakerUid && !speakerTimeOver(table, ctx.now);
	if (running && table.speakerUid === target) return passRunningMinute(table, base, ctx.now);
	if (answeredUids(table, ctx.now).has(target)) {
		throw new ClassroomError('failed-precondition', 'Already answered', 'already-answered');
	}
	const add = (uids: string[] | undefined): string[] => [...listOf(uids), target];

	return {
		...base,
		spokenUids: add(table.spokenUids),
		passedSpeakingUids: add(table.passedSpeakingUids),
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
	assertMayAct(role, action, table, ctx.now, ctx.actorUid, ctx.lessonStep);
	assertFromStep(role, action, table, ctx.lessonStep);

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
			const noDevice = table.noDeviceMembers.some((m) => m.id === uid);
			if (!table.memberUids.includes(uid) && !(noDevice && isTableTalk(table, ctx.lessonStep))) {
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
			return nextTurn(table, base);
		case 'claimTurn':
			return claimTurn(table, base, action, ctx.actorUid);
		case 'claimSpeaker':
			return claimSpeaker(table, base, ctx.actorUid, ctx.now);
		case 'finishSpeaking':
			return finishSpeaking(table, base, ctx.now);
		case 'passAsking':
			return passAsking(table, base, action, ctx);
		case 'passSpeaking':
			return passSpeaking(table, base, action, ctx);
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
