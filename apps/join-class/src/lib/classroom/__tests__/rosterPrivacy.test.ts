import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@freedi/shared-types';
import type { StatementSubscription } from '@freedi/shared-types';

/**
 * Trello btMVQMM5: the teacher may see THAT a student chose a side, never WHICH.
 * Whatever a subscription doc holds (one written by an app version from before
 * the change still has side / camp / decisionSupport), the roster handed to the
 * views carries no side at all, and the console's students only `chosen`.
 */

type Snapshot = { docs: { data: () => StatementSubscription }[] };
let deliver: ((snap: Snapshot) => void) | null = null;

vi.mock('../../firebase', () => ({
	db: {},
	doc: vi.fn(),
	collection: vi.fn(),
	query: vi.fn(),
	where: vi.fn(),
}));
vi.mock('../../resilientListeners', () => ({
	CLASS_LISTENER_KINDS: { roster: 'classRoster', mySide: 'classMySide' },
	resilientOnSnapshot: vi.fn((_kind: string, _ref: unknown, onNext: (snap: Snapshot) => void) => {
		deliver = onNext;

		return () => undefined;
	}),
}));
vi.mock('../../user', () => ({ getUserState: () => ({ user: { uid: 'me' } }) }));

import { listenRoster } from '../listeners';
import { rosterStudents } from '../consoleHelpers';
import { sideChosen, toRosterSubscription } from '../rosterPrivacy';

const PRIVATE_KEYS = ['side', 'camp', 'decisionSupport'];

function sub(uid: string, extra: Partial<StatementSubscription> = {}): StatementSubscription {
	return {
		userId: uid,
		statementId: 'm',
		role: Role.member,
		user: { displayName: `n-${uid}` },
		lastUpdate: 77,
		...extra,
	} as StatementSubscription;
}

const DOCS: StatementSubscription[] = [
	sub('legacy', { side: 10, camp: 'a', decisionSupport: 1 }),
	sub('legacySideOnly', { side: 90 }),
	sub('flagged', { sidePickedAt: 5 }),
	sub('rated', { decisionSupport: -1 }),
	sub('none'),
	sub('teacher', { role: Role.admin, camp: 'b' }),
];

describe('roster privacy', () => {
	beforeEach(() => {
		deliver = null;
	});

	it('listenRoster hands the views subscriptions without side, camp or decisionSupport', () => {
		const onData = vi.fn();
		listenRoster('m', onData);
		deliver?.({ docs: DOCS.map((d) => ({ data: () => d })) });

		const roster = onData.mock.calls[0][0] as object[];
		expect(roster).toHaveLength(DOCS.length);
		for (const entry of roster) {
			for (const key of PRIVATE_KEYS) expect(entry).not.toHaveProperty(key);
		}
		expect(JSON.stringify(roster)).not.toMatch(/"(side|camp|decisionSupport)"/);
	});

	it('the console students carry only uid, name, chosen and tableId', () => {
		const students = rosterStudents(DOCS.map(toRosterSubscription));
		for (const s of students) {
			expect(Object.keys(s).sort()).toEqual(['chosen', 'name', 'tableId', 'uid']);
		}
		const chosen = Object.fromEntries(students.map((s) => [s.uid, s.chosen]));
		expect(chosen).toEqual({
			legacy: true,
			legacySideOnly: true,
			flagged: true,
			rated: false,
			none: false,
		});
	});

	it('two students on opposite sides look the same to the teacher', () => {
		const [a] = rosterStudents([toRosterSubscription(sub('x', { side: 5, camp: 'a' }))]);
		const [b] = rosterStudents([toRosterSubscription(sub('x', { side: 95, camp: 'b' }))]);
		expect(a).toEqual(b);
	});

	it('turns a legacy pick into the flag and keeps an existing flag', () => {
		expect(toRosterSubscription(sub('l', { camp: 'center' })).sidePickedAt).toBe(77);
		expect(toRosterSubscription(sub('f', { camp: 'a', sidePickedAt: 3 })).sidePickedAt).toBe(3);
		expect(toRosterSubscription(sub('n')).sidePickedAt).toBeUndefined();
		expect(sideChosen(undefined)).toBe(false);
	});
});
