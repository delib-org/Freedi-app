import { describe, it, expect, beforeEach } from '@jest/globals';
import { Collections, Role, StatementType } from '@freedi/shared-types';
import { FakeFirestore } from '../userFeed/__tests__/fakeFirestore';

let mockDb = new FakeFirestore();

jest.mock('../db', () => ({
	get db() {
		return mockDb;
	},
}));
jest.mock('../index', () => ({
	get db() {
		return mockDb;
	},
}));
jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../fn_adminStats', () => ({
	onSubscriptionCreatedStats: jest.fn(() => Promise.resolve()),
	onStatementDeletedStats: jest.fn(() => Promise.resolve()),
}));

import {
	onSubscriptionCreated,
	onSubscriptionDeleted,
	onSubscriptionUpdated,
} from '../fn_subscriptionLifecycle';

const DISCUSSION = 'group-1';
const T0 = 1_800_000_000_000;

type SubscriptionDoc = Record<string, unknown>;

function subscriptionDoc(
	userId: string,
	role: Role,
	overrides: SubscriptionDoc = {},
): SubscriptionDoc {
	const creator = { uid: 'owner', displayName: 'Owner' };

	return {
		statementsSubscribeId: `${userId}--${DISCUSSION}`,
		userId,
		statementId: DISCUSSION,
		role,
		parentId: 'top',
		statementType: StatementType.group,
		lastUpdate: T0,
		createdAt: T0,
		user: { uid: userId, displayName: userId },
		statement: {
			statementId: DISCUSSION,
			statement: 'A group',
			statementType: StatementType.group,
			creatorId: creator.uid,
			creator,
			parentId: 'top',
			consensus: 0,
		},
		...overrides,
	};
}

const snapshotEvent = (id: string, data: SubscriptionDoc) =>
	({ params: { subscriptionId: id }, data: { id, data: () => data } }) as never;

const changeEvent = (id: string, before: SubscriptionDoc, after: SubscriptionDoc) =>
	({
		params: { subscriptionId: id },
		data: {
			before: { id, exists: true, data: () => before },
			after: { id, exists: true, data: () => after },
		},
	}) as never;

async function joinAs(
	userId: string,
	role: Role,
	overrides: SubscriptionDoc = {},
): Promise<string> {
	const id = `${userId}--${DISCUSSION}`;
	const doc = subscriptionDoc(userId, role, overrides);
	mockDb.seed(Collections.statementsSubscribe, id, doc);
	await onSubscriptionCreated(snapshotEvent(id, doc));

	return id;
}

async function leave(subscriptionId: string): Promise<void> {
	const doc = mockDb.read(Collections.statementsSubscribe, subscriptionId) as SubscriptionDoc;
	mockDb.rowsOf(Collections.statementsSubscribe).delete(subscriptionId);
	await onSubscriptionDeleted(snapshotEvent(subscriptionId, doc));
}

async function changeRole(subscriptionId: string, role: Role): Promise<void> {
	const before = mockDb.read(Collections.statementsSubscribe, subscriptionId) as SubscriptionDoc;
	const after = { ...before, role };
	mockDb.seed(Collections.statementsSubscribe, subscriptionId, after);
	await onSubscriptionUpdated(changeEvent(subscriptionId, before, after));
}

const memberCount = (): unknown => mockDb.read(Collections.statements, DISCUSSION)?.numberOfMembers;
const feedOf = (userId: string) => mockDb.read(Collections.userFeed, `${userId}--${DISCUSSION}`);

describe('subscription lifecycle (member count + userFeed)', () => {
	beforeEach(() => {
		mockDb = new FakeFirestore();
		mockDb.seed(Collections.statements, DISCUSSION, { statementId: DISCUSSION, parentId: 'top' });
	});

	it('counts members on join and creates their feed entry', async () => {
		await joinAs('owner', Role.admin);
		await joinAs('alice', Role.member);
		await joinAs('bob', Role.member);

		expect(memberCount()).toBe(3);
		expect(feedOf('alice')).toMatchObject({
			userId: 'alice',
			statementId: DISCUSSION,
			subscriptionId: `alice--${DISCUSSION}`,
			lastActivity: T0,
		});
	});

	it('recounts on leave and deletes the feed entry', async () => {
		await joinAs('owner', Role.admin);
		const alice = await joinAs('alice', Role.member);
		await leave(alice);

		expect(memberCount()).toBe(1);
		expect(feedOf('alice')).toBeUndefined();
	});

	it('keeps the count on a role change (every role counts, as before) and drops a banned member from the feed', async () => {
		await joinAs('owner', Role.admin);
		const alice = await joinAs('alice', Role.member);
		await changeRole(alice, Role.banned);

		expect(memberCount()).toBe(2);
		expect(feedOf('alice')).toBeUndefined();
	});

	it('gives a waiting member a feed entry (it leads to the waiting-for-approval screen)', async () => {
		await joinAs('carol', Role.waiting);

		expect(feedOf('carol')).toMatchObject({ userId: 'carol', statementId: DISCUSSION });
	});

	it('keeps the same entry, unbumped, when a waiting member is approved (waiting → member → admin)', async () => {
		const carol = await joinAs('carol', Role.waiting);
		mockDb.seed(Collections.userFeed, carol, { ...feedOf('carol'), lastActivity: 42 });

		await changeRole(carol, Role.member);
		expect(feedOf('carol')?.lastActivity).toBe(42);

		await changeRole(carol, Role.admin);
		expect(feedOf('carol')?.lastActivity).toBe(42);
	});

	it('deletes the entry on member → banned and recreates it on banned → member', async () => {
		const alice = await joinAs('alice', Role.member);
		await changeRole(alice, Role.banned);
		expect(feedOf('alice')).toBeUndefined();

		await changeRole(alice, Role.member);
		expect(feedOf('alice')).toMatchObject({ userId: 'alice', subscriptionId: alice });
	});

	it('deletes the entry when a member unsubscribes by role', async () => {
		const alice = await joinAs('alice', Role.member);
		await changeRole(alice, Role.unsubscribed);

		expect(feedOf('alice')).toBeUndefined();
	});

	it('reverts a ban of an admin and leaves their feed entry in place', async () => {
		const owner = await joinAs('owner', Role.admin);
		await changeRole(owner, Role.banned);

		expect(mockDb.read(Collections.statementsSubscribe, owner)?.role).toBe(Role.admin);
		expect(feedOf('owner')).toBeDefined();
	});

	it('does not count Sign-document subscriptions and gives sub-statement subscriptions no feed entry', async () => {
		await joinAs('owner', Role.admin);
		await joinAs('dora', Role.member, { statementType: StatementType.document });
		await joinAs('eve', Role.member, {
			parentId: 'some-parent',
			statement: { parentId: 'some-parent' },
		});

		expect(memberCount()).toBe(2);
		expect(feedOf('eve')).toBeUndefined();
	});

	it('does not touch the feed or the count for an update that is not a role change (e.g. read state)', async () => {
		const alice = await joinAs('alice', Role.member);
		mockDb.resetCounters();
		const before = mockDb.read(Collections.statementsSubscribe, alice) as SubscriptionDoc;
		await onSubscriptionUpdated(
			changeEvent(alice, before, { ...before, lastReadTimestamp: T0 + 1 }),
		);

		expect(mockDb.reads).toBe(0);
		expect(mockDb.writes).toBe(0);
	});

	it('converges when the delete trigger of a quick leave runs after the re-join', async () => {
		const alice = await joinAs('alice', Role.member);
		const oldDoc = mockDb.read(Collections.statementsSubscribe, alice) as SubscriptionDoc;
		// re-joined already: the subscription exists again when the late delete trigger runs
		await onSubscriptionDeleted(snapshotEvent(alice, oldDoc));

		expect(feedOf('alice')).toBeDefined();
	});
});
