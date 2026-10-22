import type { ClassTable, ClassTableAction } from '@freedi/shared-types';
import { tableDone } from '@freedi/shared-types';
import { ClassroomError } from '../classroomErrors';
import { applyTableAction, TransitionContext } from '../tableTransitions';

/**
 * Table talk v2 (IA 16 rev 2): the volunteer claim at V1 and V2, passing on
 * asking and on a minute, the question guard, the teacher's volunteer moment
 * and the askerless fallback.
 */

const NOW = 1_800_000_000_000;

function table(overrides: Partial<ClassTable> = {}): ClassTable {
	return {
		tableId: 'm--1',
		mainId: 'm',
		n: 1,
		memberUids: ['a', 'b', 'c', 'd'],
		noDeviceMembers: [],
		step: 'pick',
		askerUid: null,
		turn: 1,
		writingMode: 'each',
		writingLocked: false,
		spokenUids: [],
		usedQuestionIds: [],
		updatedAt: 0,
		...overrides,
	};
}

const as = (actorUid: string, isAdmin = false): TransitionContext => ({
	actorUid,
	isAdmin,
	now: NOW,
});
const teacher = as('teacher', true);

function failure(fn: () => unknown): ClassroomError {
	try {
		fn();
	} catch (error) {
		if (error instanceof ClassroomError) return error;
		throw error;
	}
	throw new Error('expected a refusal');
}

function run(t: ClassTable, action: ClassTableAction, ctx: TransitionContext): ClassTable {
	return applyTableAction(t, action, ctx);
}

function refusal(
	t: ClassTable,
	action: ClassTableAction,
	ctx: TransitionContext,
): { code: string; reason?: string } {
	const { code, reason } = failure(() => run(t, action, ctx));

	return { code, reason };
}

/** Turn 1 of a, over: a asked, everyone spoke or passed (V2). */
function v2(overrides: Partial<ClassTable> = {}): ClassTable {
	return table({
		step: 'talk',
		askerUid: 'a',
		questionId: 'q1',
		usedQuestionIds: ['q1'],
		askedUids: ['a'],
		spokenUids: ['a', 'b', 'c', 'd'],
		passedSpeakingUids: ['c'],
		...overrides,
	});
}

describe('claim at V1 (pick, nobody asks)', () => {
	it('makes the first tapper the asker and keeps the turn', () => {
		const next = run(table(), { action: 'nextTurn', fromTurn: 1 }, as('b'));
		expect(next).toMatchObject({ step: 'pick', turn: 1, askerUid: 'b' });
	});

	it('refuses the second tap with turn-claimed (first transaction wins)', () => {
		const won = run(table(), { action: 'nextTurn', fromTurn: 1 }, as('b'));
		expect(refusal(won, { action: 'nextTurn', fromTurn: 1 }, as('c'))).toEqual({
			code: 'failed-precondition',
			reason: 'turn-claimed',
		});
	});

	it('refuses the asker at A (they have claimed) as turn-claimed', () => {
		const a = table({ askerUid: 'b' });
		expect(refusal(a, { action: 'nextTurn' }, as('b')).reason).toBe('turn-claimed');
	});

	it('refuses a delayed claim that names an earlier turn', () => {
		const later = table({ turn: 3 });
		expect(refusal(later, { action: 'nextTurn', fromTurn: 2 }, as('b')).reason).toBe(
			'turn-claimed',
		);
	});
});

describe('claim at V2 (talk, everyone spoke or passed)', () => {
	it('starts the next turn for the claimer and clears the turn fields', () => {
		const next = run(v2(), { action: 'nextTurn', fromTurn: 1 }, as('b'));
		expect(next).toMatchObject({
			step: 'pick',
			turn: 2,
			askerUid: 'b',
			askedUids: ['a'],
			spokenUids: [],
			usedQuestionIds: ['q1'],
		});
		expect(next.questionId).toBeUndefined();
		expect(next.speakerUid).toBeUndefined();
		expect(next.passedSpeakingUids).toBeUndefined();
	});

	it('refuses with talk-not-over while someone has not spoken', () => {
		const midTalk = v2({ spokenUids: ['a', 'b'], passedSpeakingUids: undefined });
		expect(refusal(midTalk, { action: 'nextTurn', fromTurn: 1 }, as('b'))).toEqual({
			code: 'failed-precondition',
			reason: 'talk-not-over',
		});
	});

	it('counts the speaker whose minute has run out', () => {
		const lastMinute = v2({
			spokenUids: ['a', 'b', 'c'],
			passedSpeakingUids: undefined,
			speakerUid: 'd',
			speakerEndsAt: NOW - 1,
		});
		expect(run(lastMinute, { action: 'nextTurn' }, as('b')).turn).toBe(2);
	});

	it('refuses a student who already asked, and one who passed (already-asked first)', () => {
		expect(refusal(v2(), { action: 'nextTurn' }, as('a')).reason).toBe('already-asked');
		const passed = v2({ passedAskingUids: ['d'] });
		expect(refusal(passed, { action: 'nextTurn' }, as('d')).reason).toBe('already-passed');
		const both = v2({ passedAskingUids: ['a'] });
		expect(refusal(both, { action: 'nextTurn' }, as('a')).reason).toBe('already-asked');
	});

	it('still allows a claim from rate for a table that was mid-turn, and marks the old asker', () => {
		const rate = table({ step: 'rate', askerUid: 'a', turn: 2 });
		expect(run(rate, { action: 'nextTurn', fromTurn: 2 }, as('c'))).toMatchObject({
			step: 'pick',
			turn: 3,
			askerUid: 'c',
			askedUids: ['a'],
		});
	});

	it('refuses a claim at write', () => {
		expect(
			refusal(table({ step: 'write', askerUid: 'a' }), { action: 'nextTurn' }, as('b')),
		).toEqual({ code: 'failed-precondition', reason: undefined });
	});
});

describe('passAsking', () => {
	it('lets a not-yet student pass for themselves at V1 and at V2', () => {
		expect(run(table(), { action: 'passAsking' }, as('b')).passedAskingUids).toEqual(['b']);
		expect(run(v2(), { action: 'passAsking' }, as('d')).passedAskingUids).toEqual(['d']);
	});

	it('keeps the claim open for the others and never changes the asker or turn', () => {
		const next = run(v2(), { action: 'passAsking' }, as('d'));
		expect(next).toMatchObject({ askerUid: 'a', turn: 1, step: 'talk' });
	});

	it('lets the asker pass while choosing: back to V1, the question is free again', () => {
		const picking = table({ askerUid: 'b', questionId: 'q2', usedQuestionIds: ['q1', 'q2'] });
		const next = run(picking, { action: 'passAsking' }, as('b'));
		expect(next).toMatchObject({
			askerUid: null,
			passedAskingUids: ['b'],
			usedQuestionIds: ['q1'],
			step: 'pick',
		});
		expect(next.questionId).toBeUndefined();
	});

	it('refuses the asker once their turn reached talk (they have asked)', () => {
		expect(refusal(v2(), { action: 'passAsking' }, as('a')).reason).toBe('already-asked');
	});

	it('refuses an asker of a leftover rate table after pick', () => {
		const rate = table({ step: 'rate', askerUid: 'b' });
		expect(refusal(rate, { action: 'passAsking' }, as('b')).code).toBe('failed-precondition');
	});

	it('refuses a second pass and a pass after asking', () => {
		const passed = table({ passedAskingUids: ['b'] });
		expect(refusal(passed, { action: 'passAsking' }, as('b')).reason).toBe('already-passed');
		expect(refusal(table({ askedUids: ['b'] }), { action: 'passAsking' }, as('b')).reason).toBe(
			'already-asked',
		);
	});

	it('refuses a tablemate who names someone else, and a stranger', () => {
		expect(refusal(table(), { action: 'passAsking', uid: 'c' }, as('b')).code).toBe(
			'permission-denied',
		);
		expect(refusal(table(), { action: 'passAsking' }, as('zz')).code).toBe('permission-denied');
	});

	it('lets a teacher pass for a named student, and refuses an unnamed or foreign one', () => {
		const next = run(table(), { action: 'passAsking', uid: 'c' }, teacher);
		expect(next.passedAskingUids).toEqual(['c']);
		expect(refusal(table(), { action: 'passAsking' }, teacher).code).toBe('invalid-argument');
		expect(refusal(table(), { action: 'passAsking', uid: 'zz' }, teacher).code).toBe(
			'invalid-argument',
		);
	});

	it('lets a teacher pass for the asker at pick (V1 again) but not after they asked', () => {
		const picking = table({ askerUid: 'b', questionId: 'q2', usedQuestionIds: ['q2'] });
		const next = run(picking, { action: 'passAsking', uid: 'b' }, teacher);
		expect(next.askerUid).toBeNull();
		expect(next.usedQuestionIds).toEqual([]);
		expect(refusal(v2(), { action: 'passAsking', uid: 'a' }, teacher).reason).toBe('already-asked');
	});

	it('is done for the table when the last student passes at V1 (all passed)', () => {
		let t = table();
		for (const uid of ['a', 'b', 'c', 'd']) t = run(t, { action: 'passAsking' }, as(uid));
		expect(tableDone(t, NOW)).toBe(true);
		expect(refusal(t, { action: 'nextTurn' }, teacher)).toMatchObject({ reason: 'all-asked' });
	});
});

describe('passSpeaking', () => {
	const talking = (overrides: Partial<ClassTable> = {}): ClassTable =>
		table({
			step: 'talk',
			askerUid: 'a',
			questionId: 'q1',
			askedUids: ['a'],
			spokenUids: ['a'],
			speakerUid: 'b',
			speakerEndsAt: NOW + 40_000,
			...overrides,
		});

	it('lets the speaker pass: counts as spoken, the minute ends now', () => {
		const next = run(talking(), { action: 'passSpeaking' }, as('b'));
		expect(next).toMatchObject({
			speakerUid: 'b',
			speakerEndsAt: NOW,
			spokenUids: ['a', 'b'],
			passedSpeakingUids: ['b'],
		});
	});

	it('lets the asker and a teacher pass on the speaker behalf', () => {
		expect(run(talking(), { action: 'passSpeaking' }, as('a')).passedSpeakingUids).toEqual(['b']);
		expect(run(talking(), { action: 'passSpeaking' }, teacher).passedSpeakingUids).toEqual(['b']);
	});

	it('refuses a tablemate who is not the speaker (not-speaker)', () => {
		expect(refusal(talking(), { action: 'passSpeaking' }, as('c'))).toEqual({
			code: 'permission-denied',
			reason: 'not-speaker',
		});
	});

	it('refuses once the minute is over, or with nobody speaking (minute-over)', () => {
		const over = talking({ speakerEndsAt: NOW - 1 });
		expect(refusal(over, { action: 'passSpeaking' }, as('b')).reason).toBe('minute-over');
		const nobody = talking({ speakerUid: undefined, speakerEndsAt: undefined });
		expect(refusal(nobody, { action: 'passSpeaking' }, as('a')).reason).toBe('minute-over');
	});

	it('is only for talk', () => {
		expect(refusal(table({ askerUid: 'a' }), { action: 'passSpeaking' }, as('a')).code).toBe(
			'failed-precondition',
		);
	});

	it('E3-prime: calling a passed speaker again turns their chip to spoken, not passed', () => {
		const passed = run(talking(), { action: 'passSpeaking' }, as('b'));
		const again = run(passed, { action: 'nextSpeaker', uid: 'b' }, as('a'));
		expect(again.passedSpeakingUids).toEqual([]);
		expect(again.spokenUids).toContain('b');
		expect(again.speakerEndsAt).toBe(NOW + 60_000);
	});

	it('lets any tablemate call the next speaker once a pass opened the floor', () => {
		const passed = run(talking(), { action: 'passSpeaking' }, as('b'));
		expect(run(passed, { action: 'nextSpeaker', uid: 'c' }, as('d')).speakerUid).toBe('c');
	});

	it('a passed last minute puts the table at V2: the claim is allowed', () => {
		const last = talking({ spokenUids: ['a', 'c', 'd'] });
		const passed = run(last, { action: 'passSpeaking' }, as('b'));
		expect(run(passed, { action: 'nextTurn' }, as('c')).turn).toBe(2);
	});
});

describe('toTalk needs a question and records the asker', () => {
	it('refuses the asker with no question (no-question)', () => {
		expect(refusal(table({ askerUid: 'b' }), { action: 'toTalk' }, as('b'))).toEqual({
			code: 'failed-precondition',
			reason: 'no-question',
		});
	});

	it('adds the asker to askedUids and clears the previous minute passes', () => {
		const picked = table({
			askerUid: 'b',
			questionId: 'q1',
			askedUids: ['a'],
			passedSpeakingUids: ['c'],
		});
		const next = run(picked, { action: 'toTalk' }, as('b'));
		expect(next).toMatchObject({ step: 'talk', askedUids: ['a', 'b'], spokenUids: [] });
		expect(next.passedSpeakingUids).toBeUndefined();
	});

	it('lets a teacher jump to talk without a question without spending anybody turn', () => {
		const next = run(table({ askerUid: 'b' }), { action: 'toTalk' }, teacher);
		expect(next.step).toBe('talk');
		expect(next.askedUids).toBeUndefined();
	});

	it('refuses to pick a question already asked at this table', () => {
		const used = table({ askerUid: 'b', usedQuestionIds: ['q1'] });
		expect(refusal(used, { action: 'pickQuestion', questionId: 'q1' }, as('b')).code).toBe(
			'failed-precondition',
		);
	});

	it('refuses a pick by a tablemate while nobody asks (V1)', () => {
		expect(refusal(table(), { action: 'pickQuestion', questionId: 'q1' }, as('b')).code).toBe(
			'permission-denied',
		);
		expect(refusal(table(), { action: 'toTalk' }, as('b')).code).toBe('permission-denied');
	});
});

describe("teacher's next turn opens a volunteer moment", () => {
	it('goes to V1: no asker, turn + 1, the old asker marked, the turn fields cleared', () => {
		const next = run(v2(), { action: 'nextTurn' }, teacher);
		expect(next).toMatchObject({
			step: 'pick',
			turn: 2,
			askerUid: null,
			askedUids: ['a'],
			spokenUids: [],
		});
		expect(next.questionId).toBeUndefined();
		expect(next.passedSpeakingUids).toBeUndefined();
	});

	it('does not spend the turn of an asker who is still choosing', () => {
		const picking = table({ askerUid: 'b', askedUids: ['a'] });
		const next = run(picking, { action: 'nextTurn' }, teacher);
		expect(next).toMatchObject({ askerUid: null, askedUids: ['a'], turn: 2 });
	});

	it('is refused when nobody is left to ask (all-asked)', () => {
		const end = v2({ askedUids: ['a', 'b', 'd'], passedAskingUids: ['c'] });
		expect(refusal(end, { action: 'nextTurn' }, teacher)).toEqual({
			code: 'failed-precondition',
			reason: 'all-asked',
		});
	});

	it('passAsker fills an empty seat with a not-yet student, not a passed one', () => {
		const t = table({ passedAskingUids: ['c'], askedUids: ['a'] });
		expect(run(t, { action: 'passAsker', uid: 'b' }, teacher)).toMatchObject({
			askerUid: 'b',
			turn: 1,
			askedUids: ['a'],
		});
		expect(refusal(t, { action: 'passAsker', uid: 'c' }, teacher).code).toBe('invalid-argument');
		expect(refusal(t, { action: 'passAsker', uid: 'a' }, teacher).code).toBe('invalid-argument');
	});
});

describe('askerless fallback (the asker left)', () => {
	const askerless = (overrides: Partial<ClassTable> = {}): ClassTable =>
		table({ step: 'talk', askerUid: null, questionId: 'q1', ...overrides });

	it('lets any tablemate run the speakers, write and rate', () => {
		const talk = askerless({ spokenUids: ['a', 'b', 'c', 'd'] });
		expect(run(askerless(), { action: 'nextSpeaker', uid: 'b' }, as('c')).speakerUid).toBe('b');
		expect(run(talk, { action: 'toWrite' }, as('c')).step).toBe('write');
		const write = askerless({ step: 'write' });
		expect(run(write, { action: 'toRate' }, as('c')).step).toBe('rate');
	});

	it('still refuses a tablemate at a table that has an asker', () => {
		expect(
			refusal(table({ step: 'talk', askerUid: 'a' }), { action: 'nextSpeaker', uid: 'b' }, as('c'))
				.code,
		).toBe('permission-denied');
	});
});

describe('table done is derived', () => {
	it('is done when everyone asked or passed and the last talk is over', () => {
		const end = v2({ askedUids: ['a', 'b', 'd'], passedAskingUids: ['c'] });
		expect(tableDone(end, NOW)).toBe(true);
		expect(tableDone({ ...end, spokenUids: ['a'] }, NOW)).toBe(false);
		expect(tableDone(v2(), NOW)).toBe(false);
	});
});
