import { Access, Collections, Role, StatementType } from '@freedi/shared-types';
import { createFakeDb, FakeDb } from '../progress/__tests__/fakeDb';

let fake: FakeDb = createFakeDb();

jest.mock('../db', () => ({
	get db() {
		return fake.db;
	},
}));

import { ensureTopParentSubscription } from '../fn_ensureTopParentSubscription';

const TOP = 'group-1';
const Q = 'question-1';
const UID = 'user-1';
const user = { uid: UID, displayName: 'Uri', email: 'uri@example.com' };

function event(sub: Record<string, unknown>, id = `${UID}--${Q}`) {
	return {
		params: { subscriptionId: id },
		data: { id, data: () => sub },
	} as never;
}

function seedTop(overrides: Record<string, unknown> = {}): void {
	fake.seed(Collections.statements, TOP, {
		statementId: TOP,
		statement: 'The group',
		statementType: StatementType.group,
		parentId: 'top',
		topParentId: TOP,
		creatorId: 'owner',
		creator: { uid: 'owner', displayName: 'Owner' },
		createdAt: 1,
		lastUpdate: 1,
		consensus: 0,
		organizationId: 'org-1',
		...overrides,
	});
}

const baseSub = {
	role: Role.member,
	userId: UID,
	statementId: Q,
	topParentId: TOP,
	statementsSubscribeId: `${UID}--${Q}`,
	user,
	statement: { statementId: Q, topParentId: TOP },
	lastUpdate: 1,
};

beforeEach(() => {
	fake = createFakeDb();
});

describe('ensureTopParentSubscription', () => {
	it('does nothing when the subscription is already on its top parent (loop guard)', async () => {
		seedTop();
		await ensureTopParentSubscription(event({ ...baseSub, statementId: TOP }, `${UID}--${TOP}`));
		expect(fake.createCalls).toHaveLength(0);
	});

	it('skips moderated and secret tops', async () => {
		seedTop({ membership: { access: Access.moderated } });
		await ensureTopParentSubscription(event(baseSub));
		expect(fake.read(Collections.statementsSubscribe, `${UID}--${TOP}`)).toBeUndefined();
		expect(fake.createCalls).toHaveLength(0);
	});

	it('leaves an existing top-parent subscription untouched', async () => {
		seedTop();
		fake.seed(Collections.statementsSubscribe, `${UID}--${TOP}`, { role: Role.admin, userId: UID });
		await ensureTopParentSubscription(event(baseSub));
		expect(fake.read(Collections.statementsSubscribe, `${UID}--${TOP}`)).toEqual({
			role: Role.admin,
			userId: UID,
		});
		expect(fake.createCalls).toHaveLength(0);
	});

	it('skips banned / waiting / unsubscribed roles', async () => {
		seedTop();
		await ensureTopParentSubscription(event({ ...baseSub, role: Role.waiting }));
		expect(fake.createCalls).toHaveLength(0);
	});

	it('creates a member subscription with promoted fields', async () => {
		seedTop({ membership: { access: Access.openToAll } });
		await ensureTopParentSubscription(event(baseSub));

		const created = fake.read(Collections.statementsSubscribe, `${UID}--${TOP}`);
		expect(created).toMatchObject({
			role: Role.member,
			userId: UID,
			statementId: TOP,
			statementsSubscribeId: `${UID}--${TOP}`,
			parentId: 'top',
			statementType: StatementType.group,
			topParentId: TOP,
			getInAppNotification: true,
			getEmailNotification: false,
			getPushNotification: false,
			organizationId: 'org-1',
			user,
		});
		expect((created?.statement as { statementId: string }).statementId).toBe(TOP);
		expect(typeof created?.createdAt).toBe('number');
	});
});
