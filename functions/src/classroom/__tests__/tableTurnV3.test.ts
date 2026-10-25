import type { ClassTable, ClassTableAction } from '@freedi/shared-types';
import {
	askerMayAnswer,
	choosing,
	floorOpen,
	othersAnswered,
	tableDone,
} from '@freedi/shared-types';
import { ClassroomError } from '../classroomErrors';
import { applyTableAction, TransitionContext } from '../tableTransitions';

/**
 * Table talk v3 (IA 16 rev 3): "I want to start" (`claimTurn`), volunteering to
 * answer (`claimSpeaker`), finishing early, passing, the teacher-only moves and
 * the derived states (`choosing`, `askerMayAnswer`, `tableDone`).
 */

const NOW = 1_800_000_000_000;
const MINUTE = 60_000;

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

const as = (actorUid: string, now = NOW): TransitionContext => ({
	actorUid,
	isAdmin: false,
	now,
	lessonStep: 'tableTalk',
});
const atProposals = (actorUid: string): TransitionContext => ({
	...as(actorUid),
	lessonStep: 'proposals',
});
const teacher: TransitionContext = { ...as('teacher'), isAdmin: true };

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

const claim = (questionId = 'q1', fromTurn = 1): ClassTableAction => ({
	action: 'claimTurn',
	fromTurn,
	questionId,
});

/** Turn 1: a asked q1 and nobody has answered yet. */
function talking(overrides: Partial<ClassTable> = {}): ClassTable {
	return table({
		step: 'talk',
		askerUid: 'a',
		questionId: 'q1',
		usedQuestionIds: ['q1'],
		askedUids: ['a'],
		...overrides,
	});
}

/** Turn 1 over: a asked, everyone answered or passed (c passed). */
function over(overrides: Partial<ClassTable> = {}): ClassTable {
	return talking({
		spokenUids: ['b', 'c', 'd', 'a'],
		passedSpeakingUids: ['c'],
		...overrides,
	});
}

describe('claimTurn ("I want to start")', () => {
	it('makes the first tapper the asker, locks the question and goes to talk in one write', () => {
		const next = run(table(), claim('q1'), as('b'));
		expect(next).toMatchObject({
			step: 'talk',
			turn: 1,
			askerUid: 'b',
			questionId: 'q1',
			usedQuestionIds: ['q1'],
			askedUids: ['b'],
			spokenUids: [],
			updatedAt: NOW,
		});
		expect(next.speakerUid).toBeUndefined();
	});

	it('refuses the second tap with turn-claimed (first transaction wins)', () => {
		const won = run(table(), claim('q1'), as('b'));
		expect(refusal(won, claim('q2'), as('c'))).toEqual({
			code: 'failed-precondition',
			reason: 'turn-claimed',
		});
	});

	it('refuses a delayed claim that names an earlier turn', () => {
		expect(refusal(table({ turn: 2 }), claim('q1', 1), as('b')).reason).toBe('turn-claimed');
	});

	it('refuses with talk-not-over once a minute is running or someone answered', () => {
		const midTurn = talking({ spokenUids: ['b'], speakerUid: 'c', speakerEndsAt: NOW + 1000 });
		expect(refusal(midTurn, claim('q2'), as('d')).reason).toBe('talk-not-over');
	});

	it('starts the next turn when everyone answered: turn + 1, turn fields cleared, new asker', () => {
		const next = run(over(), claim('q2'), as('c'));
		expect(next).toMatchObject({
			step: 'talk',
			turn: 2,
			askerUid: 'c',
			questionId: 'q2',
			usedQuestionIds: ['q1', 'q2'],
			askedUids: ['a', 'c'],
			spokenUids: [],
		});
		expect(next.speakerUid).toBeUndefined();
		expect(next.speakerEndsAt).toBeUndefined();
		expect(next.passedSpeakingUids).toBeUndefined();
	});

	it('counts the last speaker whose minute ran out', () => {
		const ending = talking({
			spokenUids: ['b', 'c', 'a'],
			speakerUid: 'd',
			speakerEndsAt: NOW - 1,
		});
		expect(run(ending, claim('q2'), as('b')).turn).toBe(2);
	});

	it('refuses a student who already asked and one who passed asking', () => {
		expect(refusal(over(), claim('q2'), as('a')).reason).toBe('already-asked');
		const passed = over({ passedAskingUids: ['d'] });
		expect(refusal(passed, claim('q2'), as('d')).reason).toBe('already-passed');
	});

	it('refuses a question already asked at this table (question-used), own or guiding', () => {
		expect(refusal(over(), claim('q1'), as('b'))).toEqual({
			code: 'failed-precondition',
			reason: 'question-used',
		});
	});

	it('is a Table talk move: refused at Proposals, with no fromTurn, or from an unseated actor', () => {
		expect(refusal(table(), claim(), atProposals('b')).code).toBe('failed-precondition');
		expect(
			refusal(table(), { action: 'claimTurn', questionId: 'q1' } as ClassTableAction, as('b')).code,
		).toBe('invalid-argument');
		expect(refusal(table(), claim(), as('zz')).code).toBe('permission-denied');
		expect(refusal(table(), claim(), teacher).code).toBe('permission-denied');
	});

	it('accepts a table left at rate before v3 and marks the old asker as asked', () => {
		const old = table({ step: 'rate', askerUid: 'a', questionId: 'q1', usedQuestionIds: ['q1'] });
		const next = run(old, claim('q2'), as('b'));
		expect(next).toMatchObject({ turn: 2, askerUid: 'b', askedUids: ['a', 'b'] });
	});

	it('accepts a legacy pick that has an asker still choosing and frees their question', () => {
		const legacy = table({ askerUid: 'a', questionId: 'q9', usedQuestionIds: ['q9'] });
		const next = run(legacy, claim('q2'), as('b'));
		expect(next).toMatchObject({
			turn: 1,
			askerUid: 'b',
			usedQuestionIds: ['q2'],
			askedUids: ['b'],
		});
	});
});

describe('claimSpeaker ("I want to answer")', () => {
	it('gives the floor for SPEAK_SECONDS to the first tapper', () => {
		const next = run(talking(), { action: 'claimSpeaker' }, as('b'));
		expect(next).toMatchObject({ speakerUid: 'b', speakerEndsAt: NOW + MINUTE, spokenUids: [] });
	});

	it('refuses a second tap while a minute runs (floor-taken)', () => {
		const running = run(talking(), { action: 'claimSpeaker' }, as('b'));
		expect(refusal(running, { action: 'claimSpeaker' }, as('c'))).toEqual({
			code: 'failed-precondition',
			reason: 'floor-taken',
		});
	});

	it('records the previous speaker when the floor is taken again', () => {
		const first = run(talking(), { action: 'claimSpeaker' }, as('b'));
		const later = as('c', NOW + MINUTE + 1);
		expect(run(first, { action: 'claimSpeaker' }, later)).toMatchObject({
			speakerUid: 'c',
			spokenUids: ['b'],
		});
	});

	it('refuses someone who already answered, or passed (already-answered)', () => {
		const first = run(talking(), { action: 'claimSpeaker' }, as('b'));
		const after = as('b', NOW + MINUTE + 1);
		expect(refusal(first, { action: 'claimSpeaker' }, after).reason).toBe('already-answered');
		const passed = run(talking(), { action: 'passSpeaking' }, as('c'));
		expect(refusal(passed, { action: 'claimSpeaker' }, as('c')).reason).toBe('already-answered');
	});

	it('keeps the asker out until one other tablemate answered (others-first)', () => {
		expect(refusal(talking(), { action: 'claimSpeaker' }, as('a'))).toEqual({
			code: 'failed-precondition',
			reason: 'others-first',
		});
		const answered = talking({ spokenUids: ['b'] });
		expect(run(answered, { action: 'claimSpeaker' }, as('a')).speakerUid).toBe('a');
	});

	it('unlocks the asker when the minute of the first answerer ran out with no write', () => {
		const ended = talking({ speakerUid: 'b', speakerEndsAt: NOW - 1 });
		expect(run(ended, { action: 'claimSpeaker' }, as('a')).spokenUids).toEqual(['b']);
	});

	it('does not unlock the asker on one pass, but does when every other tablemate passed', () => {
		const onePass = talking({ spokenUids: ['b'], passedSpeakingUids: ['b'] });
		expect(refusal(onePass, { action: 'claimSpeaker' }, as('a')).reason).toBe('others-first');
		const allPass = talking({ spokenUids: ['b', 'c', 'd'], passedSpeakingUids: ['b', 'c', 'd'] });
		expect(run(allPass, { action: 'claimSpeaker' }, as('a')).speakerUid).toBe('a');
	});

	it('needs a question, a seat and the talk step', () => {
		expect(
			refusal(talking({ questionId: undefined }), { action: 'claimSpeaker' }, as('b')).code,
		).toBe('failed-precondition');
		expect(refusal(table(), { action: 'claimSpeaker' }, as('b')).code).toBe('failed-precondition');
		expect(refusal(talking(), { action: 'claimSpeaker' }, as('zz')).code).toBe('permission-denied');
	});
});

describe('finishSpeaking', () => {
	const running = (): ClassTable => run(talking(), { action: 'claimSpeaker' }, as('b'));

	it('ends the speaker minute now and records them as answered', () => {
		const next = run(running(), { action: 'finishSpeaking' }, as('b', NOW + 5000));
		expect(next).toMatchObject({ speakerEndsAt: NOW + 5000, spokenUids: ['b'] });
		expect(floorOpen(next, NOW + 5000)).toBe(true);
	});

	it('lets a teacher end a minute, and refuses another tablemate (not-speaker)', () => {
		expect(run(running(), { action: 'finishSpeaking' }, teacher).spokenUids).toEqual(['b']);
		expect(refusal(running(), { action: 'finishSpeaking' }, as('c'))).toEqual({
			code: 'permission-denied',
			reason: 'not-speaker',
		});
	});

	it('refuses once the minute is over (minute-over)', () => {
		const late = as('b', NOW + MINUTE + 1);
		expect(refusal(running(), { action: 'finishSpeaking' }, late).reason).toBe('minute-over');
		expect(refusal(talking(), { action: 'finishSpeaking' }, teacher).reason).toBe('minute-over');
	});
});

describe('passSpeaking at Table talk', () => {
	it('lets a student pass before speaking: counts as answered and passed', () => {
		const next = run(talking(), { action: 'passSpeaking' }, as('c'));
		expect(next).toMatchObject({ spokenUids: ['c'], passedSpeakingUids: ['c'] });
		expect(next.speakerUid).toBeUndefined();
	});

	it('lets a teacher pass for a named student, and refuses an unnamed one', () => {
		const next = run(talking(), { action: 'passSpeaking', uid: 'c' }, teacher);
		expect(next.passedSpeakingUids).toEqual(['c']);
		expect(refusal(talking(), { action: 'passSpeaking' }, teacher).code).toBe('invalid-argument');
	});

	it('refuses a student who names someone else', () => {
		expect(refusal(talking(), { action: 'passSpeaking', uid: 'd' }, as('c')).code).toBe(
			'permission-denied',
		);
	});

	it('refuses a second pass or a pass after answering (already-answered)', () => {
		const passed = run(talking(), { action: 'passSpeaking' }, as('c'));
		expect(refusal(passed, { action: 'passSpeaking' }, as('c')).reason).toBe('already-answered');
	});

	it('ends the own running minute as passed (the speaker passes mid-minute)', () => {
		const running = run(talking(), { action: 'claimSpeaker' }, as('b'));
		const next = run(running, { action: 'passSpeaking' }, as('b'));
		expect(next).toMatchObject({
			speakerEndsAt: NOW,
			passedSpeakingUids: ['b'],
			spokenUids: ['b'],
		});
	});

	it('a passed last minute puts the table at choosing', () => {
		const last = talking({ spokenUids: ['a', 'b', 'd'] });
		const passed = run(last, { action: 'passSpeaking' }, as('c'));
		expect(choosing(passed, NOW)).toBe(true);
	});
});

describe('passSpeaking at Proposals keeps its meaning', () => {
	const proposals = (): ClassTable =>
		table({ step: 'talk', askerUid: 'a', speakerUid: 'b', speakerEndsAt: NOW + 40_000 });

	it('lets the speaker, the asker or a teacher end the running minute as passed', () => {
		expect(
			run(proposals(), { action: 'passSpeaking' }, atProposals('b')).passedSpeakingUids,
		).toEqual(['b']);
		expect(
			run(proposals(), { action: 'passSpeaking' }, atProposals('a')).passedSpeakingUids,
		).toEqual(['b']);
		expect(
			run(proposals(), { action: 'passSpeaking' }, { ...atProposals('teacher'), isAdmin: true })
				.passedSpeakingUids,
		).toEqual(['b']);
	});

	it('refuses another tablemate (not-speaker) and a minute that is over', () => {
		expect(refusal(proposals(), { action: 'passSpeaking' }, atProposals('c')).reason).toBe(
			'not-speaker',
		);
		const done = table({ step: 'talk', askerUid: 'a', speakerUid: 'b', speakerEndsAt: NOW - 1 });
		expect(refusal(done, { action: 'passSpeaking' }, atProposals('b')).reason).toBe('minute-over');
	});
});

describe('teacher-only moves at Table talk', () => {
	it('refuses a member nextTurn and opens the next pick for a teacher', () => {
		expect(refusal(over(), { action: 'nextTurn', fromTurn: 1 }, as('b')).code).toBe(
			'permission-denied',
		);
		const next = run(over({ askedUids: ['a'] }), { action: 'nextTurn' }, teacher);
		expect(next).toMatchObject({ step: 'pick', turn: 2, askerUid: null });
		expect(next.questionId).toBeUndefined();
	});

	it('frees the question of a legacy asker who is still choosing', () => {
		const picking = table({ askerUid: 'b', questionId: 'q2', usedQuestionIds: ['q1', 'q2'] });
		const next = run(picking, { action: 'nextTurn' }, teacher);
		expect(next.usedQuestionIds).toEqual(['q1']);
		expect(next.questionId).toBeUndefined();
	});

	it('is refused when nobody is left to ask (all-asked)', () => {
		const end = over({ askedUids: ['a', 'b', 'd'], passedAskingUids: ['c'] });
		expect(refusal(end, { action: 'nextTurn' }, teacher).reason).toBe('all-asked');
	});

	it('nextSpeaker: the asker and tablemates are refused, a teacher may name a device or no-device member', () => {
		const nd = talking({ noDeviceMembers: [{ id: 'nd_1', name: 'Yossi' }] });
		const next: ClassTableAction = { action: 'nextSpeaker', uid: 'b' };
		expect(refusal(nd, next, as('a')).code).toBe('permission-denied');
		expect(refusal(nd, next, as('c')).code).toBe('permission-denied');
		expect(run(nd, next, teacher).speakerUid).toBe('b');
		expect(run(nd, { action: 'nextSpeaker', uid: 'nd_1' }, teacher)).toMatchObject({
			speakerUid: 'nd_1',
			speakerEndsAt: NOW + MINUTE,
		});
		expect(refusal(nd, { action: 'nextSpeaker', uid: 'nobody' }, teacher).code).toBe(
			'invalid-argument',
		);
	});

	it('nextSpeaker at Proposals is unchanged: the asker runs it, no-device ids are refused', () => {
		const prop = table({
			step: 'talk',
			askerUid: 'a',
			noDeviceMembers: [{ id: 'nd_1', name: 'Yossi' }],
		});
		expect(run(prop, { action: 'nextSpeaker', uid: 'b' }, atProposals('a')).speakerUid).toBe('b');
		expect(refusal(prop, { action: 'nextSpeaker', uid: 'nd_1' }, atProposals('a')).code).toBe(
			'invalid-argument',
		);
	});
});

describe('passAsking', () => {
	it('lets a not-yet student pass for themselves while choosing, never changing asker or turn', () => {
		const next = run(over(), { action: 'passAsking' }, as('d'));
		expect(next).toMatchObject({ passedAskingUids: ['d'], askerUid: 'a', turn: 1 });
	});

	it('refuses a second pass, a pass after asking, and naming someone else', () => {
		const passed = run(table(), { action: 'passAsking' }, as('d'));
		expect(refusal(passed, { action: 'passAsking' }, as('d')).reason).toBe('already-passed');
		expect(refusal(over(), { action: 'passAsking' }, as('a')).reason).toBe('already-asked');
		expect(refusal(table(), { action: 'passAsking', uid: 'b' }, as('c')).code).toBe(
			'permission-denied',
		);
	});

	it('lets a teacher pass for a named student', () => {
		expect(run(table(), { action: 'passAsking', uid: 'b' }, teacher).passedAskingUids).toEqual([
			'b',
		]);
		expect(refusal(table(), { action: 'passAsking' }, teacher).code).toBe('invalid-argument');
	});
});

describe('derived states', () => {
	it('floorOpen: nobody holds a running minute', () => {
		expect(floorOpen(talking(), NOW)).toBe(true);
		expect(floorOpen(talking({ speakerEndsAt: NOW + 1 }), NOW)).toBe(false);
	});

	it('othersAnswered ignores the asker and passes, and counts a finished minute', () => {
		expect(othersAnswered(talking({ spokenUids: ['a'] }), NOW)).toBe(false);
		expect(othersAnswered(talking({ spokenUids: ['b'], passedSpeakingUids: ['b'] }), NOW)).toBe(
			false,
		);
		expect(othersAnswered(talking({ speakerUid: 'b', speakerEndsAt: NOW - 1 }), NOW)).toBe(true);
		expect(othersAnswered(talking({ speakerUid: 'b', speakerEndsAt: NOW + 1 }), NOW)).toBe(false);
	});

	it('askerMayAnswer: one answered, or every other tablemate answered or passed', () => {
		expect(askerMayAnswer(talking(), NOW)).toBe(false);
		expect(askerMayAnswer(talking({ spokenUids: ['c'] }), NOW)).toBe(true);
		const allPass = talking({ spokenUids: ['b', 'c', 'd'], passedSpeakingUids: ['b', 'c', 'd'] });
		expect(askerMayAnswer(allPass, NOW)).toBe(true);
	});

	it('choosing: at pick, or at talk once everyone answered; never once the table is done', () => {
		expect(choosing(table(), NOW)).toBe(true);
		expect(choosing(talking(), NOW)).toBe(false);
		expect(choosing(over(), NOW)).toBe(true);
		const end = over({ askedUids: ['a', 'b', 'd'], passedAskingUids: ['c'] });
		expect(choosing(end, NOW)).toBe(false);
		expect(tableDone(end, NOW)).toBe(true);
	});

	it('no-device members never hold up "everyone answered"', () => {
		const nd = over({ noDeviceMembers: [{ id: 'nd_1', name: 'Yossi' }] });
		expect(choosing(nd, NOW)).toBe(true);
	});
});

describe('a whole table, claim to done', () => {
	it('three students ask once each, nobody asks twice', () => {
		let t = table({ memberUids: ['a', 'b', 'c'] });
		const speak = (uid: string, at: number): void => {
			t = run(t, { action: 'claimSpeaker' }, as(uid, at));
			t = run(t, { action: 'finishSpeaking' }, as(uid, at + 1000));
		};
		t = run(t, claim('q1', 1), as('a'));
		speak('b', NOW);
		speak('a', NOW + 2000);
		speak('c', NOW + 4000);
		expect(choosing(t, NOW + 6000)).toBe(true);
		t = run(t, claim('q2', 1), as('b', NOW + 6000));
		expect(t).toMatchObject({ turn: 2, askerUid: 'b' });
		speak('a', NOW + 7000);
		speak('c', NOW + 9000);
		speak('b', NOW + 11_000);
		t = run(t, claim('own', 2), as('c', NOW + 13_000));
		expect(t.usedQuestionIds).toEqual(['q1', 'q2', 'own']);
		speak('a', NOW + 14_000);
		speak('b', NOW + 16_000);
		speak('c', NOW + 18_000);
		expect(tableDone(t, NOW + 20_000)).toBe(true);
		expect(choosing(t, NOW + 20_000)).toBe(false);
	});
});

describe('askerless fallback (the asker left)', () => {
	it('lets any tablemate leave an askerless pick for writing only at Proposals', () => {
		expect(run(table(), { action: 'toWrite' }, atProposals('c')).step).toBe('write');
		expect(refusal(table(), { action: 'toWrite' }, as('c')).code).toBe('permission-denied');
	});
});
