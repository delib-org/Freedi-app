import { describe, expect, it } from 'vitest';
import {
	classJoinErrorKey,
	classJoinReduce,
	INITIAL_CLASS_JOIN,
	type ClassJoinEvent,
	type ClassJoinState,
} from '../flows/classJoin';

function run(events: ClassJoinEvent[], from: ClassJoinState = INITIAL_CLASS_JOIN): ClassJoinState {
	return events.reduce(classJoinReduce, from);
}

describe('classJoinReduce — the new student', () => {
	it('claims a spot and must acknowledge the PIN before finishing', () => {
		const atPin = run([
			{ kind: 'choose-new' },
			{ kind: 'submit' },
			{ kind: 'claimed', alias: 'נמר אמיץ', pin: '4821' },
		]);
		expect(atPin.step).toBe('pin-keep');
		expect(atPin.pin).toBe('4821');

		const done = classJoinReduce(atPin, { kind: 'pin-acknowledged' });
		expect(done.step).toBe('done');
		// The PIN leaves memory with the screen
		expect(done.pin).toBeNull();
	});

	it('returns to the claim form with the error when the alias is taken', () => {
		const state = run([
			{ kind: 'choose-new' },
			{ kind: 'submit' },
			{ kind: 'failed', errorKey: 'classJoin.alias_taken' },
		]);
		expect(state.step).toBe('claim');
		expect(state.errorKey).toBe('classJoin.alias_taken');
	});
});

describe('classJoinReduce — the returning student', () => {
	const atPick = run([
		{ kind: 'choose-returning' },
		{
			kind: 'aliases-loaded',
			className: 'ח2',
			aliases: [{ memberId: 'm1', alias: 'נמר אמיץ' }],
		},
	]);

	it('loads the alias picker, then asks for the PIN', () => {
		expect(atPick.step).toBe('pick');
		const atEntry = classJoinReduce(atPick, { kind: 'picked', memberId: 'm1' });
		expect(atEntry.step).toBe('pin-entry');
		expect(atEntry.memberId).toBe('m1');
	});

	it('finishes on a successful reclaim', () => {
		const done = run(
			[{ kind: 'picked', memberId: 'm1' }, { kind: 'submit' }, { kind: 'reclaimed' }],
			atPick,
		);
		expect(done.step).toBe('done');
	});

	it('bounces a wrong PIN back to the entry with the error', () => {
		const state = run(
			[
				{ kind: 'picked', memberId: 'm1' },
				{ kind: 'submit' },
				{ kind: 'failed', errorKey: 'classJoin.wrong_pin' },
			],
			atPick,
		);
		expect(state.step).toBe('pin-entry');
		expect(state.errorKey).toBe('classJoin.wrong_pin');
	});

	it('back from the PIN entry forgets the picked spot', () => {
		const state = run([{ kind: 'picked', memberId: 'm1' }, { kind: 'back' }], atPick);
		expect(state.step).toBe('pick');
		expect(state.memberId).toBeNull();
	});
});

describe('classJoinReduce — stray events', () => {
	it('ignores a network resolution after the student pressed back', () => {
		const state = run([
			{ kind: 'choose-new' },
			{ kind: 'submit' },
			{ kind: 'failed', errorKey: 'common.error' },
			{ kind: 'claimed', alias: 'ghost', pin: '0000' },
		]);
		expect(state.step).toBe('claim');
		expect(state.claimedAlias).toBeNull();
	});
});

describe('classJoinErrorKey', () => {
	it('maps callable failures to sentences', () => {
		expect(classJoinErrorKey(new Error('already-exists: taken'))).toBe('classJoin.alias_taken');
		expect(classJoinErrorKey(new Error('permission-denied: Wrong PIN'))).toBe(
			'classJoin.wrong_pin',
		);
		expect(classJoinErrorKey(new Error('resource-exhausted: Too many wrong PINs'))).toBe(
			'classJoin.pin_locked',
		);
		expect(classJoinErrorKey(new Error('not-found: Class not found'))).toBe(
			'classJoin.class_not_found',
		);
		expect(classJoinErrorKey(new Error('boom'))).toBe('common.error');
	});
});
