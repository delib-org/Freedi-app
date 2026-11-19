import { describe, expect, it } from 'vitest';
import type { ClassTable } from '@freedi/shared-types';
import { proposalsTurnOf } from '@freedi/shared-types';
import { predictAllTablesTo, predictMoveStudent, predictTableAction } from '../tableOptimism';

const NOW = 1_000_000;
const student = { uid: 'u1', isAdmin: false, now: NOW };
const teacher = { uid: 'teacher', isAdmin: true, now: NOW };

const table = (n: number, extra: Partial<ClassTable> = {}): ClassTable =>
	({
		tableId: `m--${n}`,
		mainId: 'm',
		n,
		step: 'talk',
		turn: 1,
		memberUids: [],
		spokenUids: [],
		usedQuestionIds: [],
		noDeviceMembers: [],
		...extra,
	}) as ClassTable;

describe('predictMoveStudent', () => {
	const tables = [table(1, { memberUids: ['a', 'u1'] }), table(2, { memberUids: ['b'] })];

	it('takes the student off the old table and seats them last at the new one', () => {
		const next = predictMoveStudent('u1', 2).apply(tables);
		expect(next[0].memberUids).toEqual(['a']);
		expect(next[1].memberUids).toEqual(['b', 'u1']);
	});

	it('unseats with null', () => {
		const next = predictMoveStudent('u1', null).apply(tables);
		expect(next.flatMap((x) => x.memberUids)).toEqual(['a', 'b']);
	});

	it('does not change the server data it was given', () => {
		predictMoveStudent('u1', 2).apply(tables);
		expect(tables[0].memberUids).toEqual(['a', 'u1']);
	});

	it('is confirmed only when the server shows the student at the new table alone', () => {
		const change = predictMoveStudent('u1', 2);
		expect(change.isConfirmedBy(tables)).toBe(false);
		expect(change.isConfirmedBy(change.apply(tables))).toBe(true);
		expect(
			change.isConfirmedBy([table(1, { memberUids: ['u1'] }), table(2, { memberUids: ['u1'] })]),
		).toBe(false);
	});

	it('leaves the other tables as they are', () => {
		const next = predictMoveStudent('u1', 2).apply(tables);
		expect(next[1]).not.toBe(tables[1]);
		const three = [...tables, table(3, { memberUids: ['c'] })];
		expect(predictMoveStudent('u1', 2).apply(three)[2]).toBe(three[2]);
	});
});

describe('predictAllTablesTo', () => {
	it('moves every table to the step and clears the floor', () => {
		const tables = [
			table(1, { step: 'talk', speakerUid: 'a', speakerEndsAt: 5, speakerMs: 60_000 }),
			table(2, { step: 'write' }),
		];
		const next = predictAllTablesTo('rate').apply(tables);
		expect(next.map((x) => x.step)).toEqual(['rate', 'rate']);
		expect(next[0].speakerUid).toBeUndefined();
		expect(next[0].speakerEndsAt).toBeUndefined();
	});

	it('gives a table that enters a new step a fresh pen, and keeps it on a repeated tap', () => {
		const tables = [
			table(1, { step: 'write', writerUid: 'a', writtenUids: ['a'] }),
			table(2, { step: 'talk', writerUid: 'b', writtenUids: ['b'] }),
		];
		const next = predictAllTablesTo('write').apply(tables);
		expect(next[0].writerUid).toBe('a');
		expect(next[1].writerUid).toBeUndefined();
		expect(next[1].writtenUids).toBeUndefined();
	});

	it('starts the speakers afresh at talk, at the first turn', () => {
		const tables = [table(1, { step: 'rate', spokenUids: ['a'], passedSpeakingUids: ['a'] })];
		const next = predictAllTablesTo('talk').apply(tables)[0];
		expect(next.spokenUids).toEqual([]);
		expect(next.passedSpeakingUids).toBeUndefined();
		expect(proposalsTurnOf(next)).toBe(1);
	});

	it('another turn: advances only a table still at the turn the console saw', () => {
		const tables = [table(1, { proposalsTurn: 2 }), table(2, { proposalsTurn: 3 })];
		const change = predictAllTablesTo('talk', {
			newTurn: true,
			fromTurns: { 'm--1': 2, 'm--2': 2 },
		});
		const next = change.apply(tables);
		expect(proposalsTurnOf(next[0])).toBe(3);
		expect(next[1]).toBe(tables[1]);
	});

	it('is confirmed when every table shows the step', () => {
		const change = predictAllTablesTo('rate');
		expect(change.isConfirmedBy([table(1, { step: 'rate' }), table(2, { step: 'talk' })])).toBe(
			false,
		);
		expect(change.isConfirmedBy([table(1, { step: 'rate' }), table(2, { step: 'rate' })])).toBe(
			true,
		);
	});

	it('another turn is not confirmed until the turn moved', () => {
		const change = predictAllTablesTo('talk', { newTurn: true, fromTurns: { 'm--1': 1 } });
		expect(change.isConfirmedBy([table(1, { step: 'talk', proposalsTurn: 1 })])).toBe(false);
		expect(change.isConfirmedBy([table(1, { step: 'talk', proposalsTurn: 2 })])).toBe(true);
	});
});

describe('predictTableAction', () => {
	it('guesses nothing for a race the server decides', () => {
		for (const action of [
			{ action: 'claimSpeaker' },
			{ action: 'claimPen' },
			{ action: 'claimTurn', fromTurn: 1, questionId: 'q' },
		] as const) {
			expect(predictTableAction('m--1', action, student)).toBeNull();
		}
	});

	it('toWrite moves the table to write, records the last speaker and clears the floor and pen', () => {
		const t = table(1, { step: 'talk', speakerUid: 'a', speakerEndsAt: 9, writerUid: 'z' });
		const change = predictTableAction('m--1', { action: 'toWrite' }, student);
		const next = change?.apply([t])[0];
		expect(next?.step).toBe('write');
		expect(next?.spokenUids).toEqual(['a']);
		expect(next?.speakerUid).toBeUndefined();
		expect(next?.writerUid).toBeUndefined();
	});

	it('toWrite on a table already writing keeps the pen', () => {
		const t = table(1, { step: 'write', writerUid: 'z' });
		const next = predictTableAction('m--1', { action: 'toWrite' }, student)?.apply([t])[0];
		expect(next?.writerUid).toBe('z');
	});

	it('only a teacher is shown the table moving to rate or talk', () => {
		expect(predictTableAction('m--1', { action: 'toRate' }, student)).toBeNull();
		expect(predictTableAction('m--1', { action: 'toTalk' }, student)).toBeNull();
		const rated = predictTableAction('m--1', { action: 'toRate' }, teacher)?.apply([table(1)]);
		expect(rated?.[0].step).toBe('rate');
		const talk = predictTableAction('m--1', { action: 'toTalk' }, teacher)?.apply([
			table(1, { step: 'rate', spokenUids: ['a'] }),
		]);
		expect(talk?.[0].step).toBe('talk');
		expect(talk?.[0].spokenUids).toEqual([]);
	});

	it('leaves other tables alone', () => {
		const others = [table(1), table(2)];
		const next = predictTableAction('m--1', { action: 'toRate' }, teacher)?.apply(others);
		expect(next?.[1]).toBe(others[1]);
	});

	it('passing the pen for oneself frees it and counts as written, without moving the step', () => {
		const t = table(1, { step: 'write', writerUid: 'u1', memberUids: ['u1', 'u2'] });
		const change = predictTableAction('m--1', { action: 'passWriting' }, student);
		const next = change?.apply([t])[0];
		expect(next?.writerUid).toBeUndefined();
		expect(next?.writtenUids).toEqual(['u1']);
		expect(next?.step).toBe('write');
		expect(change?.isConfirmedBy([t])).toBe(false);
		expect(change?.isConfirmedBy([next as ClassTable])).toBe(true);
	});

	it('does not guess a pass for somebody else', () => {
		expect(predictTableAction('m--1', { action: 'passWriting', uid: 'u2' }, student)).toBeNull();
		expect(predictTableAction('m--1', { action: 'passSpeaking', uid: 'u2' }, student)).toBeNull();
	});

	it('passing the answer with nobody speaking marks the caller spoken and passed', () => {
		const t = table(1, { memberUids: ['u1', 'u2'] });
		const change = predictTableAction('m--1', { action: 'passSpeaking' }, student);
		const next = change?.apply([t])[0];
		expect(next?.spokenUids).toEqual(['u1']);
		expect(next?.passedSpeakingUids).toEqual(['u1']);
	});

	it('does not guess a pass while somebody holds the floor (the server ends their minute)', () => {
		const t = table(1, { speakerUid: 'u2', speakerEndsAt: NOW + 5000 });
		const next = predictTableAction('m--1', { action: 'passSpeaking' }, student)?.apply([t])[0];
		expect(next).toBe(t);
	});

	it('finishing own minute records the speaker and ends the clock', () => {
		const t = table(1, { speakerUid: 'u1', speakerEndsAt: NOW + 30_000 });
		const change = predictTableAction('m--1', { action: 'finishSpeaking' }, student);
		const next = change?.apply([t])[0];
		expect(next?.spokenUids).toEqual(['u1']);
		expect(next?.speakerEndsAt).toBe(NOW);
		expect(change?.isConfirmedBy([t])).toBe(false);
		expect(change?.isConfirmedBy([next as ClassTable])).toBe(true);
	});

	it('finishing is no change for somebody who is not the speaker', () => {
		const t = table(1, { speakerUid: 'u2', speakerEndsAt: NOW + 30_000 });
		const change = predictTableAction('m--1', { action: 'finishSpeaking' }, student);
		expect(change?.apply([t])[0]).toBe(t);
		expect(change?.isConfirmedBy([t])).toBe(true);
	});

	it('does not move a locked writing mode', () => {
		const t = table(1, { writingLocked: true, writingMode: 'each' });
		const change = predictTableAction('m--1', { action: 'setWritingMode', mode: 'table' }, teacher);
		expect(change?.apply([t])[0].writingMode).toBe('each');
	});

	it('sets the writing mode when it is not locked', () => {
		const t = table(1, { writingMode: 'each' });
		const change = predictTableAction('m--1', { action: 'setWritingMode', mode: 'table' }, teacher);
		expect(change?.apply([t])[0].writingMode).toBe('table');
	});
});
