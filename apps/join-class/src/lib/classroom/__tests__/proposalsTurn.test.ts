import { describe, expect, it } from 'vitest';
import type { ClassTable } from '@freedi/shared-types';
import { proposalsTalkState } from '../proposalsTurn';

const NOW = 1_800_000_000_000;

function table(overrides: Partial<ClassTable> = {}): ClassTable {
	return {
		tableId: 'm--1',
		mainId: 'm',
		n: 1,
		memberUids: ['a', 'b', 'c'],
		noDeviceMembers: [],
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

const lesson = (proposalsTurns: number) => ({ statementSettings: { proposalsTurns } });

describe('proposalsTalkState (IA 25.6)', () => {
	it('may speak at a fresh table, turn 1 of 1', () => {
		expect(proposalsTalkState(table(), 'b', null, NOW)).toEqual({ kind: 'may', turn: 1, max: 1 });
	});

	it('names who speaks, and me when it is my time', () => {
		const running = table({ speakerUid: 'b', speakerEndsAt: NOW + 1000 });
		expect(proposalsTalkState(running, 'c', null, NOW).kind).toBe('speaking');
		expect(proposalsTalkState(running, 'b', null, NOW).kind).toBe('mine');
	});

	it('already spoke this turn: no buttons; the speaker whose time ended counts', () => {
		expect(proposalsTalkState(table({ spokenUids: ['b'] }), 'b', null, NOW).kind).toBe('spoke');
		const ended = table({ speakerUid: 'b', speakerEndsAt: NOW - 1 });
		expect(proposalsTalkState(ended, 'b', null, NOW).kind).toBe('spoke');
		expect(proposalsTalkState(ended, 'c', null, NOW).kind).toBe('may');
	});

	it('done once everyone spoke in the last turn', () => {
		const spoken = table({ spokenUids: ['a', 'b', 'c'] });
		expect(proposalsTalkState(spoken, 'b', null, NOW)).toEqual({ kind: 'done', turn: 1, max: 1 });
	});

	it('with a turn left, everyone may speak again and the screen names the next turn', () => {
		const spoken = table({ spokenUids: ['a', 'b', 'c'] });
		expect(proposalsTalkState(spoken, 'b', lesson(2), NOW)).toEqual({
			kind: 'may',
			turn: 2,
			max: 2,
		});
	});

	it('a turn the teacher gave past the setting is the maximum', () => {
		const third = table({ spokenUids: ['a'], proposalsTurn: 3 });
		expect(proposalsTalkState(third, 'b', lesson(1), NOW)).toEqual({
			kind: 'may',
			turn: 3,
			max: 3,
		});
	});
});
