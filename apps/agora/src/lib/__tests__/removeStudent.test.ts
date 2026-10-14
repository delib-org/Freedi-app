import { describe, expect, it } from 'vitest';
import {
	INITIAL_REMOVE_STUDENT,
	REMOVE_FAILED_KEY,
	removeStudentReduce,
	type RemoveStudentEvent,
	type RemoveStudentState,
} from '../flows/removeStudent';

const run = (...events: RemoveStudentEvent[]): RemoveStudentState =>
	events.reduce(removeStudentReduce, INITIAL_REMOVE_STUDENT);

describe('removeStudentReduce', () => {
	it('asks about one row at a time', () => {
		const state = run({ kind: 'ask', uid: 'a' }, { kind: 'ask', uid: 'b' });
		expect(state.confirmUid).toBe('b');
	});

	it('cancel closes the question', () => {
		expect(run({ kind: 'ask', uid: 'a' }, { kind: 'cancel' }).confirmUid).toBeNull();
	});

	it('start sends the asked row once; a second tap is ignored', () => {
		const started = run({ kind: 'ask', uid: 'a' }, { kind: 'start' });
		expect(started.busyUid).toBe('a');
		expect(removeStudentReduce(started, { kind: 'start' })).toBe(started);
	});

	it('start without a question does nothing', () => {
		expect(run({ kind: 'start' })).toEqual(INITIAL_REMOVE_STUDENT);
	});

	it('holds the question while the server works', () => {
		const started = run({ kind: 'ask', uid: 'a' }, { kind: 'start' });
		expect(removeStudentReduce(started, { kind: 'ask', uid: 'b' })).toBe(started);
		expect(removeStudentReduce(started, { kind: 'cancel' })).toBe(started);
		expect(removeStudentReduce(started, { kind: 'roster', uids: new Set() })).toBe(started);
	});

	it('success closes the question and remembers who went', () => {
		const state = run(
			{ kind: 'ask', uid: 'a' },
			{ kind: 'start' },
			{ kind: 'succeeded', name: 'Blue Fox' },
		);
		expect(state).toEqual({
			confirmUid: null,
			busyUid: null,
			errorKey: null,
			removedName: 'Blue Fox',
		});
	});

	it('failure keeps the question open and says so; asking again clears the line', () => {
		const failed = run({ kind: 'ask', uid: 'a' }, { kind: 'start' }, { kind: 'failed' });
		expect(failed.confirmUid).toBe('a');
		expect(failed.busyUid).toBeNull();
		expect(failed.errorKey).toBe(REMOVE_FAILED_KEY);
		expect(removeStudentReduce(failed, { kind: 'start' }).errorKey).toBeNull();
	});

	it('a row that vanished (removed from another device) closes its question', () => {
		const asking = run({ kind: 'ask', uid: 'a' });
		expect(removeStudentReduce(asking, { kind: 'roster', uids: new Set(['a', 'b']) })).toBe(asking);
		expect(
			removeStudentReduce(asking, { kind: 'roster', uids: new Set(['b']) }).confirmUid,
		).toBeNull();
	});
});
