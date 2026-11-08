import type { ClassTable, ClassTableAction } from '@freedi/shared-types';
import { ClassroomError } from '../classroomErrors';
import { applyTableAction, TransitionContext } from '../tableTransitions';

/**
 * IA 25.6: at Proposals each tablemate speaks once per turn. When everyone has
 * spoken the next turn opens with the next tap (while a turn is left), else the
 * table is done; the teacher gives another turn with `nextProposalsTurn`.
 */

const NOW = 1_800_000_000_000;
const MINUTE = 60_000;

function table(overrides: Partial<ClassTable> = {}): ClassTable {
	return {
		tableId: 'm--1',
		mainId: 'm',
		n: 1,
		memberUids: ['a', 'b', 'c'],
		noDeviceMembers: [{ id: 'nd_1', name: 'Noa' }],
		step: 'talk',
		askerUid: 'a',
		turn: 1,
		writingMode: 'each',
		writingLocked: false,
		spokenUids: [],
		usedQuestionIds: [],
		updatedAt: 0,
		...overrides,
	};
}

const at = (actorUid: string, patch: Partial<TransitionContext> = {}): TransitionContext => ({
	actorUid,
	isAdmin: false,
	now: NOW,
	lessonStep: 'proposals',
	speakMs: MINUTE,
	...patch,
});
const teacher = (patch: Partial<TransitionContext> = {}): TransitionContext =>
	at('teacher', { isAdmin: true, ...patch });

function refusal(t: ClassTable, action: ClassTableAction, ctx: TransitionContext): ClassroomError {
	try {
		applyTableAction(t, action, ctx);
	} catch (error) {
		if (error instanceof ClassroomError) return error;
		throw error;
	}
	throw new Error('expected a refusal');
}

const claim: ClassTableAction = { action: 'claimSpeaker' };
const pass: ClassTableAction = { action: 'passSpeaking' };

describe('claimSpeaker at Proposals: once per turn', () => {
	it('gives the floor and records nothing else; the second tablemate waits for the floor', () => {
		const next = applyTableAction(table(), claim, at('b'));
		expect(next).toMatchObject({ speakerUid: 'b', speakerEndsAt: NOW + MINUTE, spokenUids: [] });
		expect(refusal(next, claim, at('c')).reason).toBe('floor-taken');
	});

	it('refuses a tablemate who already spoke this turn (already-answered)', () => {
		const spoke = table({ spokenUids: ['b'] });
		expect(refusal(spoke, claim, at('b')).reason).toBe('already-answered');
		const timeOver = table({ speakerUid: 'b', speakerEndsAt: NOW - 1 });
		expect(refusal(timeOver, claim, at('b')).reason).toBe('already-answered');
		// another tablemate takes over the ended time
		expect(applyTableAction(timeOver, claim, at('c')).spokenUids).toEqual(['b']);
	});

	it('refuses everyone once every turn is spoken (turns-done)', () => {
		const done = table({ spokenUids: ['a', 'b', 'c'] });
		expect(refusal(done, claim, at('a')).reason).toBe('turns-done');
		expect(refusal(done, pass, at('a')).reason).toBe('turns-done');
	});

	it('the no-device member never gates the turn', () => {
		const done = table({ spokenUids: ['a', 'b', 'c'] });
		expect(refusal(done, claim, at('b')).reason).toBe('turns-done');
	});
});

describe('the next turn opens with the next tap (while a turn is left)', () => {
	const spoken = table({ spokenUids: ['a', 'b', 'c'], passedSpeakingUids: ['c'] });

	it('a claim after everyone spoke moves to turn 2 and takes the floor in one write', () => {
		const next = applyTableAction(spoken, claim, at('b', { proposalsTurns: 2 }));
		expect(next).toMatchObject({
			proposalsTurn: 2,
			spokenUids: [],
			speakerUid: 'b',
			speakerEndsAt: NOW + MINUTE,
		});
		expect(next.passedSpeakingUids).toBeUndefined();
	});

	it('a pass after everyone spoke moves to turn 2 and counts as spoken there', () => {
		const next = applyTableAction(spoken, pass, at('c', { proposalsTurns: 3 }));
		expect(next).toMatchObject({ proposalsTurn: 2, spokenUids: ['c'], passedSpeakingUids: ['c'] });
		expect(next.speakerUid).toBeUndefined();
	});

	it('the last turn of the setting is the last: no turn opens past it', () => {
		const lastTurn = { ...spoken, proposalsTurn: 2 };
		expect(refusal(lastTurn, claim, at('b', { proposalsTurns: 2 })).reason).toBe('turns-done');
	});

	it('a teacher who gave a turn past the setting makes that turn the maximum', () => {
		const third = { ...spoken, proposalsTurn: 3 };
		expect(refusal(third, claim, at('b', { proposalsTurns: 1 })).reason).toBe('turns-done');
		const open = { ...third, spokenUids: ['a'] };
		expect(applyTableAction(open, claim, at('b', { proposalsTurns: 1 })).speakerUid).toBe('b');
	});
});

describe('passSpeaking at Proposals before speaking ("I want to pass")', () => {
	it('counts as spoken and passed, with no floor taken', () => {
		const next = applyTableAction(table(), pass, at('c'));
		expect(next).toMatchObject({ spokenUids: ['c'], passedSpeakingUids: ['c'] });
		expect(next.speakerUid).toBeUndefined();
	});

	it('refuses a second pass or a pass after speaking (already-answered)', () => {
		expect(refusal(table({ spokenUids: ['c'] }), pass, at('c')).reason).toBe('already-answered');
	});

	it('refuses a tablemate while someone else speaks (not-speaker), as before', () => {
		const running = table({ speakerUid: 'b', speakerEndsAt: NOW + 30_000 });
		expect(refusal(running, pass, at('c')).reason).toBe('not-speaker');
	});

	it('the speaker still ends their own running time as passed', () => {
		const running = table({ speakerUid: 'b', speakerEndsAt: NOW + 30_000 });
		const next = applyTableAction(running, pass, at('b'));
		expect(next).toMatchObject({
			speakerEndsAt: NOW,
			spokenUids: ['b'],
			passedSpeakingUids: ['b'],
		});
	});

	it('a teacher names who passes', () => {
		const next = applyTableAction(table(), { action: 'passSpeaking', uid: 'c' }, teacher());
		expect(next.spokenUids).toEqual(['c']);
		expect(refusal(table(), { action: 'passSpeaking', uid: 'zed' }, teacher()).code).toBe(
			'invalid-argument',
		);
	});
});

describe('nextProposalsTurn (the teacher gives another turn)', () => {
	it('opens the next turn whatever the table state: turn + 1, nobody spoken, no speaker', () => {
		const done = table({
			spokenUids: ['a', 'b', 'c'],
			passedSpeakingUids: ['c'],
			speakerUid: 'c',
			speakerEndsAt: NOW - 1,
			speakerMs: MINUTE,
		});
		const next = applyTableAction(done, { action: 'nextProposalsTurn' }, teacher());
		expect(next).toMatchObject({ proposalsTurn: 2, spokenUids: [], updatedAt: NOW });
		expect(next.speakerUid).toBeUndefined();
		expect(next.speakerEndsAt).toBeUndefined();
		expect(next.speakerMs).toBeUndefined();
		expect(next.passedSpeakingUids).toBeUndefined();
	});

	it('runs mid-turn too and leaves Table talk fields alone', () => {
		const mid = table({ step: 'talk', spokenUids: ['a'], proposalsTurn: 2, turn: 3 });
		const next = applyTableAction(mid, { action: 'nextProposalsTurn' }, teacher());
		expect(next).toMatchObject({ proposalsTurn: 3, turn: 3, step: 'talk', askerUid: 'a' });
	});

	it('is refused while the table is not talking (write / rate / pick keep their turn)', () => {
		for (const step of ['pick', 'write', 'rate'] as const) {
			expect(refusal(table({ step }), { action: 'nextProposalsTurn' }, teacher()).code).toBe(
				'failed-precondition',
			);
		}
	});

	it('a tap naming the turn it saw advances once; a stale tap is a no-op', () => {
		const first = applyTableAction(
			table({ spokenUids: ['a', 'b', 'c'] }),
			{ action: 'nextProposalsTurn', fromTurn: 1 },
			teacher(),
		);
		expect(first.proposalsTurn).toBe(2);
		const again = applyTableAction(first, { action: 'nextProposalsTurn', fromTurn: 1 }, teacher());
		expect(again).toEqual(first);
		expect(
			applyTableAction(first, { action: 'nextProposalsTurn', fromTurn: 2 }, teacher())
				.proposalsTurn,
		).toBe(3);
	});

	it('is teacher-only: the asker and tablemates are refused', () => {
		expect(refusal(table(), { action: 'nextProposalsTurn' }, at('a')).code).toBe(
			'permission-denied',
		);
		expect(refusal(table(), { action: 'nextProposalsTurn' }, at('b')).code).toBe(
			'permission-denied',
		);
	});
});

describe('Table talk is untouched', () => {
	it('a claim at Table talk still needs a question and never moves proposalsTurn', () => {
		const talk = table({ questionId: 'q1', spokenUids: ['a', 'b', 'c'] });
		const ctx = at('b', { lessonStep: 'tableTalk' });
		expect(refusal(talk, claim, ctx).reason).toBe('already-answered');
		expect(talk.proposalsTurn).toBeUndefined();
	});
});
