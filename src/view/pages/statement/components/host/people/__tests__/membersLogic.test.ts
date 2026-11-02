import { Role, StatementSubscription } from '@freedi/shared-types';
import { actionsFor, countByFilter, kindOf, selectMembers, toMemberEntries } from '../membersLogic';

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
	it('names each row by role, the creator first by uid, and drops unsubscribed people', () => {
		expect(kindOf(Role.admin, 'u-tal', 'u-tal')).toBe('creator');
		expect(kindOf(Role.creator, 'x', undefined)).toBe('creator');
		expect(kindOf(Role.unsubscribed, 'x', undefined)).toBeNull();
		expect(kindOf(undefined, 'x', undefined)).toBeNull();

		const entries = toMemberEntries(subs, context);
		expect(entries.map((e) => e.id)).not.toContain('gone');
		expect(entries.find((e) => e.id === 'maya')?.isSelf).toBe(true);
	});

	it('drops rows with no user id', () => {
		const anonymous = { ...sub('x', Role.member), user: undefined } as StatementSubscription;

		expect(toMemberEntries([anonymous], context)).toEqual([]);
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
