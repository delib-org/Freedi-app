import { Role, StatementSubscription } from '@freedi/shared-types';
import {
	actionsFor,
	countByFilter,
	countPeople,
	kindOf,
	selectMembers,
	toMemberEntries,
} from '../membersLogic';

function sub(id: string, role: Role, displayName = id): StatementSubscription {
	return {
		statementsSubscribeId: id,
		statementId: 's1',
		userId: `u-${id}`,
		role,
		user: { uid: `u-${id}`, displayName },
	} as StatementSubscription;
}

const subs = [
	sub('dana', Role.member, 'Dana'),
	sub('tal', Role.admin, 'Tal'),
	sub('roi', Role.banned, 'Roi'),
	sub('maya', Role.admin, 'Maya'),
	sub('avi', Role.member, 'Avi'),
	sub('wait', Role.waiting, 'Wanda'),
	sub('gone', Role.unsubscribed, 'Gone'),
];
const context = { creatorUid: 'u-tal', selfUid: 'u-maya' };

describe('membersLogic', () => {
	describe('a subscription whose user is someone else', () => {
		const creatorCopy = {
			statementsSubscribeId: 'u-host--s1',
			statementId: 's1',
			userId: 'u-host',
			role: Role.admin,
			user: { uid: 'u-tal', displayName: 'Tal the creator', photoURL: 'https://photo/tal.png' },
		} as StatementSubscription;
		const options = { ...context, unnamedLabel: 'Unnamed' };

		it('is the real person: a host, with a neutral name and none of the creator photo', () => {
			const [entry] = toMemberEntries([creatorCopy], options);

			expect(entry).toMatchObject({ uid: 'u-host', kind: 'host', name: 'Unnamed' });
			expect(entry.photoURL).toBeUndefined();
			expect(actionsFor(entry, true)).toEqual(['removeHost']);
		});

		it('is counted as its own person, not folded into the creator', () => {
			expect(countPeople([creatorCopy], 'u-tal')).toBe(1);
			expect(kindOf(creatorCopy.role, 'u-host', 'u-tal')).toBe('host');
		});

		it('takes name and photo from user once it is repaired', () => {
			const repaired = {
				...creatorCopy,
				user: { uid: 'u-host', displayName: 'Real Host', photoURL: 'https://photo/host.png' },
			} as StatementSubscription;
			const [entry] = toMemberEntries([repaired], options);

			expect(entry).toMatchObject({
				uid: 'u-host',
				kind: 'host',
				name: 'Real Host',
				photoURL: 'https://photo/host.png',
			});
		});

		it('still knows the creator by userId', () => {
			const creator = {
				...creatorCopy,
				statementsSubscribeId: 'u-tal--s1',
				userId: 'u-tal',
			} as StatementSubscription;
			const [entry] = toMemberEntries([creator], options);

			expect(entry).toMatchObject({ uid: 'u-tal', kind: 'creator', name: 'Tal the creator' });
		});

		it('uses the neutral name for a repaired doc with no known name, too', () => {
			const nameless = {
				...creatorCopy,
				user: { uid: 'u-host', displayName: '' },
			} as StatementSubscription;

			expect(toMemberEntries([nameless], options)[0].name).toBe('Unnamed');
		});

		it('falls back to user for a legacy doc with no userId', () => {
			const legacy = { ...creatorCopy, userId: '' } as StatementSubscription;

			expect(toMemberEntries([legacy], options)[0]).toMatchObject({
				uid: 'u-tal',
				kind: 'creator',
				name: 'Tal the creator',
			});
		});
	});

	it('names each row by role, the creator first by uid, and drops unsubscribed people', () => {
		expect(kindOf(Role.admin, 'u-tal', 'u-tal')).toBe('creator');
		expect(kindOf(Role.creator, 'x', undefined)).toBe('creator');
		expect(kindOf(Role.unsubscribed, 'x', undefined)).toBeNull();
		expect(kindOf(undefined, 'x', undefined)).toBeNull();

		const entries = toMemberEntries(subs, context);
		expect(entries.map((e) => e.id)).not.toContain('gone');
		expect(entries.find((e) => e.id === 'maya')?.isSelf).toBe(true);
	});

	it('drops rows that name nobody: neither userId nor user', () => {
		const nobody = {
			...sub('x', Role.member),
			userId: '',
			user: undefined,
		} as unknown as StatementSubscription;

		expect(toMemberEntries([nobody], context)).toEqual([]);
		expect(countPeople([nobody], 'u-tal')).toBe(0);
	});

	it('keeps a row with a userId and no user, under the neutral name', () => {
		const noUser = {
			...sub('x', Role.member),
			user: undefined,
		} as unknown as StatementSubscription;

		expect(toMemberEntries([noUser], { ...context, unnamedLabel: 'Unnamed' })[0]).toMatchObject({
			uid: 'u-x',
			name: 'Unnamed',
			kind: 'member',
		});
	});

	it('applies an optimistic role over the stored one', () => {
		const entries = toMemberEntries(subs, {
			...context,
			roleOverrides: new Map([['dana', Role.admin]]),
		});

		expect(entries.find((e) => e.id === 'dana')?.kind).toBe('host');
	});

	it('counts All as hosts + members + waiting + blocked (creator counts as a host)', () => {
		const counts = countByFilter(toMemberEntries(subs, context));

		expect(counts).toEqual({ all: 6, hosts: 2, members: 2, waiting: 1, blocked: 1 });
	});

	it('sorts the creator first, then hosts, then by name, with blocked last', () => {
		const order = selectMembers(toMemberEntries(subs, context), 'all', '').map((e) => e.name);

		expect(order).toEqual(['Tal', 'Maya', 'Avi', 'Dana', 'Wanda', 'Roi']);
	});

	it('filters by chip and by name, case-insensitively', () => {
		const entries = toMemberEntries(subs, context);

		expect(selectMembers(entries, 'hosts', '').map((e) => e.name)).toEqual(['Tal', 'Maya']);
		expect(selectMembers(entries, 'blocked', '').map((e) => e.name)).toEqual(['Roi']);
		expect(selectMembers(entries, 'all', ' dAN ').map((e) => e.name)).toEqual(['Dana']);
	});

	it('offers each role its actions, and none on the creator, yourself, or when you cannot manage', () => {
		const byId = Object.fromEntries(toMemberEntries(subs, context).map((e) => [e.id, e]));

		expect(actionsFor(byId.tal, true)).toEqual([]);
		expect(actionsFor(byId.maya, true)).toEqual([]);
		expect(actionsFor(byId.dana, true)).toEqual(['makeHost', 'block']);
		expect(actionsFor(byId.roi, true)).toEqual(['unblock']);
		expect(actionsFor(byId.wait, true)).toEqual(['letIn', 'decline']);
		expect(actionsFor(byId.dana, false)).toEqual([]);
	});

	it('never offers Block on a host (the rules and the server refuse it)', () => {
		const host = toMemberEntries([sub('h', Role.admin)], context)[0];

		expect(actionsFor(host, true)).toEqual(['removeHost']);
	});
});
