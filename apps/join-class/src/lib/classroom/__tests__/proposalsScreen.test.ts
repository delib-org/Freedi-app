import { describe, expect, it } from 'vitest';
import type { ClassTable } from '@freedi/shared-types';
import {
	controlsOf,
	nextLineOf,
	proposalsScreenOf,
	type ProposalsScreen,
	type TalkScreenState,
	type WriteScreenState,
} from '../proposalsScreen';

/** The states of the Proposals spec: T1-T6 talk, W1-W4 write, R1-R2 rate (IA join-class-proposals-flow §4). */

const NOW = 1_800_000_000_000;

function table(overrides: Partial<ClassTable> = {}): ClassTable {
	return {
		tableId: 'm--1',
		mainId: 'm',
		n: 1,
		memberUids: ['me', 'noa', 'avi'],
		noDeviceMembers: [],
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

const lesson = (proposalsTurns: number) => ({ statementSettings: { proposalsTurns } });

function screen(t: ClassTable, unlimited = false, turns = 1): ProposalsScreen {
	return proposalsScreenOf({ table: t, uid: 'me', main: lesson(turns), now: NOW, unlimited });
}

const talk = (t: ClassTable, turns = 1): TalkScreenState =>
	screen(t, false, turns) as TalkScreenState;
const write = (t: ClassTable, unlimited = false): WriteScreenState =>
	screen(t, unlimited) as WriteScreenState;

describe('talk: T1-T6', () => {
	it('T1 round starts: I may speak, the others who have not are named, only "speak" is offered', () => {
		const s = talk(table());
		expect(s.kind).toBe('may');
		expect(nextLineOf(s, 'me')).toEqual({
			key: 'proposals.next.not_spoken',
			uids: ['noa', 'avi'],
		});
		expect(controlsOf(s)).toMatchObject({
			speak: true,
			finish: false,
			moveOn: false,
			toWrite: false,
		});
	});

	it('T1 with everyone else spoken has no next line', () => {
		expect(nextLineOf(talk(table({ spokenUids: ['noa', 'avi'] })), 'me')).toBeNull();
	});

	it('T2 my time: "I am done" only', () => {
		const s = talk(table({ speakerUid: 'me', speakerEndsAt: NOW + 5000 }));
		expect(s.kind).toBe('mine');
		expect(controlsOf(s)).toMatchObject({ finish: true, speak: false, moveOn: false });
		expect(nextLineOf(s, 'me')).toBeNull();
	});

	it('T3 a tablemate speaks: no buttons, the line says who is after', () => {
		const s = talk(table({ speakerUid: 'noa', speakerEndsAt: NOW + 5000 }));
		expect(s.kind).toBe('speaking');
		expect(s.speakerUid).toBe('noa');
		expect(Object.values(controlsOf(s)).some(Boolean)).toBe(false);
		expect(nextLineOf(s, 'me')).toEqual({ key: 'proposals.next.after', uids: ['noa'] });
	});

	it('T3 with nobody left after the speaker has no next line', () => {
		const s = talk(
			table({ spokenUids: ['me', 'avi'], speakerUid: 'noa', speakerEndsAt: NOW + 5000 }),
		);
		expect(nextLineOf(s, 'me')).toBeNull();
	});

	it('T4 I spoke, others not yet: wait for the names, Move on is the only control', () => {
		const s = talk(table({ spokenUids: ['me'] }));
		expect(s.kind).toBe('spoke');
		expect(nextLineOf(s, 'me')).toEqual({
			key: 'proposals.next.waiting_for',
			uids: ['noa', 'avi'],
		});
		expect(controlsOf(s)).toMatchObject({ moveOn: true, speak: false, toWrite: false });
	});

	it('Move on shows in T4 only', () => {
		const states = [
			table(),
			table({ speakerUid: 'me', speakerEndsAt: NOW + 5000 }),
			table({ speakerUid: 'noa', speakerEndsAt: NOW + 5000 }),
			table({ spokenUids: ['me', 'noa', 'avi'] }),
			table({ step: 'write' }),
			table({ step: 'rate' }),
		];
		expect(states.filter((t) => controlsOf(screen(t)).moveOn)).toHaveLength(0);
		expect(controlsOf(screen(table({ spokenUids: ['me'] }))).moveOn).toBe(true);
	});

	it('T5 round over with another round left: the next round is named and the round starts afresh', () => {
		const s = talk(table({ spokenUids: ['me', 'noa', 'avi'] }), 2);
		expect(s).toMatchObject({ kind: 'may', roundOver: true, turn: 2, max: 2 });
		expect(controlsOf(s).speak).toBe(true);
		expect(nextLineOf(s, 'me')?.uids).toEqual(['noa', 'avi']);
	});

	it('T6 all rounds spoken: one button moves the whole table to writing', () => {
		const s = talk(table({ spokenUids: ['me', 'noa', 'avi'] }));
		expect(s.kind).toBe('done');
		expect(controlsOf(s)).toMatchObject({ toWrite: true, speak: false, moveOn: false });
		expect(nextLineOf(s, 'me')).toBeNull();
	});

	it('a table still at pick is drawn at talk', () => {
		expect(screen(table({ step: 'pick' })).part).toBe('talk');
	});
});

describe('write: W1-W4', () => {
	const writing = (o: Partial<ClassTable> = {}): ClassTable => table({ step: 'write', ...o });

	it('W1 pen free, I have not written: claim, with the ones who have not written named', () => {
		const s = write(writing());
		expect(s.kind).toBe('free');
		expect(controlsOf(s)).toMatchObject({ claimPen: true, sendOrPass: false });
		expect(nextLineOf(s, 'me')).toEqual({
			key: 'proposals.next.not_written',
			uids: ['noa', 'avi'],
		});
	});

	it('W2 I hold the pen: send or pass, no claim', () => {
		const s = write(writing({ writerUid: 'me' }));
		expect(s.kind).toBe('mine');
		expect(controlsOf(s)).toMatchObject({ sendOrPass: true, claimPen: false });
		expect(nextLineOf(s, 'me')).toBeNull();
	});

	it('W3 a tablemate holds the pen: no buttons at all, her text is the screen', () => {
		const s = write(writing({ writerUid: 'noa' }));
		expect(s.kind).toBe('other');
		expect(s.writerUid).toBe('noa');
		expect(Object.values(controlsOf(s)).some(Boolean)).toBe(false);
		expect(nextLineOf(s, 'me')).toEqual({ key: 'proposals.next.after', uids: ['noa'] });
	});

	it('W4 I sent or passed: wait for the names, no buttons', () => {
		const s = write(writing({ writtenUids: ['me'], writerUid: 'noa' }));
		expect(s.kind).toBe('wait');
		expect(s.writerUid).toBe('noa');
		expect(Object.values(controlsOf(s)).some(Boolean)).toBe(false);
		expect(nextLineOf(s, 'me')).toEqual({
			key: 'proposals.next.waiting_for',
			uids: ['noa', 'avi'],
		});
	});

	it('after W3 the tablemate who already wrote goes to W4, the one who has not to W1', () => {
		const after = (written: string[]) => write(writing({ writtenUids: written }));
		expect(after(['me', 'noa']).kind).toBe('wait');
		expect(after(['noa']).kind).toBe('free');
	});

	it('a lost race is just W3: the winner holds the pen', () => {
		expect(write(writing({ writerUid: 'avi' })).kind).toBe('other');
	});

	it('with unlimited proposals one who sent may take the free pen again', () => {
		const t = writing({ writtenUids: ['me'] });
		expect(controlsOf(write(t)).claimPen).toBe(false);
		expect(controlsOf(write(t, true)).claimPen).toBe(true);
		expect(write(t, true).kind).toBe('wait');
	});

	it('a tablemate without a phone is not in memberUids, so never named or waited for', () => {
		const t = writing({ noDeviceMembers: [{ id: 'nd_1', name: 'Yossi' }] });
		expect(nextLineOf(write(t), 'me')?.uids).toEqual(['noa', 'avi']);
	});
});

describe('rate: R1-R2', () => {
	it('is the rate screen with no controls of its own', () => {
		const s = screen(table({ step: 'rate' }));
		expect(s.part).toBe('rate');
		expect(Object.values(controlsOf(s)).some(Boolean)).toBe(false);
		expect(nextLineOf(s, 'me')).toBeNull();
	});
});

describe('the screen follows the table, never the phone', () => {
	it('the same table gives every tablemate the same part', () => {
		const t = table({ step: 'write' });
		for (const uid of t.memberUids) {
			expect(
				proposalsScreenOf({ table: t, uid, main: null, now: NOW, unlimited: false }).part,
			).toBe('write');
		}
	});
});
