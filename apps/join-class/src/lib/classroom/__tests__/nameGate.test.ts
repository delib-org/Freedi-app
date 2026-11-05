import { describe, expect, it } from 'vitest';
import { needsNameForm } from '../nameGate';
import type { NameGateInput } from '../nameGate';

const ANON = { displayName: null, isAnonymous: true };

function input(extra: Partial<NameGateInput> = {}): NameGateInput {
	return { user: ANON, deviceName: null, sub: null, subLoaded: true, ...extra };
}

describe('needsNameForm (Trello dZQmKXRY: no student reaches the lesson without a name)', () => {
	it('asks a student with no name anywhere, at any step', () => {
		expect(needsNameForm(input())).toBe(true);
		expect(needsNameForm(input({ sub: { user: { uid: 'u', displayName: '' } } }))).toBe(true);
		expect(needsNameForm(input({ sub: { user: { uid: 'u', displayName: '   ' } } }))).toBe(true);
	});

	it('asks a student who joined late: the subscription exists but was made without a name', () => {
		expect(needsNameForm(input({ sub: { user: { uid: 'u', displayName: '' } } }))).toBe(true);
	});

	it('does not ask before sign-in or before the subscription has answered', () => {
		expect(needsNameForm(input({ user: null }))).toBe(false);
		expect(needsNameForm(input({ subLoaded: false }))).toBe(false);
	});

	it('does not ask once the subscription holds a name (a phone with cleared storage, a second device)', () => {
		expect(needsNameForm(input({ sub: { user: { uid: 'u', displayName: 'Dana' } } }))).toBe(false);
	});

	it('does not ask when this phone already knows the name', () => {
		expect(needsNameForm(input({ deviceName: 'Dana' }))).toBe(false);
	});

	it('does not ask a signed-in (non-anonymous) user whose account has a name, but asks when it has none', () => {
		expect(needsNameForm(input({ user: { displayName: 'Dana Levi', isAnonymous: false } }))).toBe(
			false,
		);
		expect(needsNameForm(input({ user: { displayName: '', isAnonymous: false } }))).toBe(true);
		// the phone's typed name is ignored for a real account, as everywhere else
		expect(
			needsNameForm(input({ user: { displayName: '', isAnonymous: false }, deviceName: 'Dana' })),
		).toBe(true);
	});

	it('a rename request from the teacher asks again, even for a student who has a name', () => {
		const named = { user: { uid: 'u', displayName: 'Dana' }, renameRequested: true };
		expect(needsNameForm(input({ sub: named }))).toBe(true);
		expect(needsNameForm(input({ sub: named, deviceName: 'Dana' }))).toBe(true);
		expect(needsNameForm(input({ sub: { ...named, renameRequested: false } }))).toBe(false);
	});
});
