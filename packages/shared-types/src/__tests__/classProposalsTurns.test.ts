import {
	proposalsDone,
	proposalsMaxTurns,
	proposalsTurnOf,
	proposalsTurnOver,
	proposalsTurnsOf,
	spokeThisTurn,
} from '../models/classroom/classroomLogic';
import {
	DEFAULT_PROPOSALS_TURNS,
	PROPOSALS_TURNS_CHOICES,
} from '../models/classroom/classroomModel';
import type { ClassTable } from '../models/classroom/classroomModel';

/** IA 25.6: one turn each at Proposals; the teacher sets 1-3 turns or gives another one. */

const NOW = 1_000_000;

function table(overrides: Partial<ClassTable> = {}): ClassTable {
	return {
		tableId: 'm--1',
		mainId: 'm',
		n: 1,
		memberUids: ['a', 'b', 'c'],
		noDeviceMembers: [{ id: 'nd_1', name: 'Noa' }],
		step: 'talk',
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

const lesson = (proposalsTurns?: number) => ({ statementSettings: { proposalsTurns } });

describe('proposalsTurnsOf', () => {
	it('is one when the lesson sets nothing', () => {
		expect(proposalsTurnsOf(null)).toBe(DEFAULT_PROPOSALS_TURNS);
		expect(proposalsTurnsOf({ statementSettings: {} })).toBe(1);
	});

	it('follows a choice from the list and ignores a value outside it', () => {
		for (const turns of PROPOSALS_TURNS_CHOICES) {
			expect(proposalsTurnsOf(lesson(turns))).toBe(turns);
		}
		expect(proposalsTurnsOf(lesson(7))).toBe(1);
		expect(proposalsTurnsOf(lesson(0))).toBe(1);
	});
});

describe('proposalsTurnOf and proposalsMaxTurns', () => {
	it('reads an absent turn as the first', () => {
		expect(proposalsTurnOf(table())).toBe(1);
		expect(proposalsTurnOf(table({ proposalsTurn: 2 }))).toBe(2);
		expect(proposalsTurnOf(table({ proposalsTurn: 0 }))).toBe(1);
	});

	it('max is the setting, or the turn a teacher already opened past it', () => {
		expect(proposalsMaxTurns(table(), lesson(2))).toBe(2);
		expect(proposalsMaxTurns(table({ proposalsTurn: 3 }), lesson(1))).toBe(3);
		expect(proposalsMaxTurns(table({ proposalsTurn: 2 }), null)).toBe(2);
	});
});

describe('spokeThisTurn', () => {
	it('counts who spoke or passed, and the speaker once their time is over', () => {
		const t = table({ spokenUids: ['a'], speakerUid: 'b', speakerEndsAt: NOW + 10 });
		expect(spokeThisTurn(t, 'a', NOW)).toBe(true);
		expect(spokeThisTurn(t, 'b', NOW)).toBe(false);
		expect(spokeThisTurn(t, 'b', NOW + 10)).toBe(true);
		expect(spokeThisTurn(t, 'c', NOW)).toBe(false);
	});
});

describe('proposalsTurnOver and proposalsDone', () => {
	it('a turn is over once every device member spoke or passed; the no-device member never gates', () => {
		expect(proposalsTurnOver(table({ spokenUids: ['a', 'b'] }), NOW)).toBe(false);
		expect(proposalsTurnOver(table({ spokenUids: ['a', 'b', 'c'] }), NOW)).toBe(true);
		const lastRunning = table({ spokenUids: ['a', 'b'], speakerUid: 'c', speakerEndsAt: NOW + 1 });
		expect(proposalsTurnOver(lastRunning, NOW)).toBe(false);
		expect(proposalsTurnOver(lastRunning, NOW + 1)).toBe(true);
	});

	it('is done when the turn is over and no turn is left', () => {
		const spoken = table({ spokenUids: ['a', 'b', 'c'] });
		expect(proposalsDone(spoken, null, NOW)).toBe(true);
		expect(proposalsDone(spoken, lesson(2), NOW)).toBe(false);
		expect(proposalsDone({ ...spoken, proposalsTurn: 2 }, lesson(2), NOW)).toBe(true);
	});

	it('is never done while someone has not spoken this turn', () => {
		expect(proposalsDone(table({ spokenUids: ['a', 'b'], proposalsTurn: 3 }), lesson(1), NOW)).toBe(
			false,
		);
	});

	it('raising the setting re-opens a done table', () => {
		const done = table({ spokenUids: ['a', 'b', 'c'], proposalsTurn: 1 });
		expect(proposalsDone(done, lesson(1), NOW)).toBe(true);
		expect(proposalsDone(done, lesson(2), NOW)).toBe(false);
	});
});
