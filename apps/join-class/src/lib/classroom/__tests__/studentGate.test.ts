import { describe, expect, it } from 'vitest';
import { studentGateOf, type StudentGateInput } from '../studentGate';

type Sub = NonNullable<StudentGateInput['sub']>;

/** A subscription as the gate reads it (only the fields the gate looks at). */
function subOf(fields: Record<string, unknown> = {}): Sub {
	return { user: { displayName: 'Dana Levi' }, ...fields } as unknown as Sub;
}

const NAMED = subOf();

function input(overrides: Partial<StudentGateInput> = {}): StudentGateInput {
	return {
		connected: true,
		user: { displayName: null, isAnonymous: true },
		deviceName: null,
		sub: NAMED,
		subLoaded: true,
		reenter: false,
		...overrides,
	};
}

describe('studentGateOf in an ordinary lesson', () => {
	it('keeps the ordinary name form, and never the registered gate', () => {
		expect(studentGateOf(input({ connected: false, sub: null }))).toBe('name');
		expect(studentGateOf(input({ connected: false }))).toBe('none');
		expect(studentGateOf(input({ connected: false, sub: subOf({ seatMovedAt: 5 }) }))).toBe('none');
	});
});

describe('studentGateOf in a connected lesson', () => {
	it('sends a walk-in with no subscription through classArriveByName, even with a name on the device', () => {
		expect(studentGateOf(input({ sub: null, deviceName: 'Dana' }))).toBe('registered');
	});

	it('asks the full name of a subscription that has none', () => {
		expect(studentGateOf(input({ sub: subOf({ user: undefined }) }))).toBe('registered');
		expect(studentGateOf(input({ sub: subOf({ user: { displayName: '  ' } }) }))).toBe(
			'registered',
		);
	});

	it('shows the steps to a student who arrived', () => {
		expect(studentGateOf(input())).toBe('none');
	});

	it('waits for the subscription before deciding', () => {
		expect(studentGateOf(input({ sub: null, subLoaded: false }))).toBe('none');
		expect(studentGateOf(input({ user: null, sub: null }))).toBe('none');
	});

	it('says the seat moved when another device took it', () => {
		expect(studentGateOf(input({ sub: subOf({ seatMovedAt: 1700 }) }))).toBe('seat-moved');
	});

	it('opens the gate again on purpose, over a student who is in and over the moved state', () => {
		expect(studentGateOf(input({ reenter: true }))).toBe('registered');
		expect(studentGateOf(input({ reenter: true, sub: subOf({ seatMovedAt: 1700 }) }))).toBe(
			'registered',
		);
	});

	it('answers a teacher rename with the ordinary form', () => {
		expect(studentGateOf(input({ sub: subOf({ renameRequested: true }) }))).toBe('name');
	});
});
