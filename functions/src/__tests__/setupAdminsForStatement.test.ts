import { Collections, Role, Statement, StatementType } from '@freedi/shared-types';
import { createFakeDb, FakeDb } from '../progress/__tests__/fakeDb';

let fake: FakeDb = createFakeDb();

jest.mock('../db', () => ({
	get db() {
		return fake.db;
	},
}));

import { MAX_INHERITED_ADMINS, setupAdminsForStatement } from '../setupAdminsForStatement';

const TOP = 'group-1';
const PARENT = 'question-1';
const NEW = 'option-1';
const CREATOR = 'creator-1';

function newStatement(overrides: Partial<Statement> = {}): Statement {
	return {
		statementId: NEW,
		statement: 'An option',
		statementType: StatementType.option,
		parentId: PARENT,
		topParentId: TOP,
		parents: [TOP, PARENT],
		creatorId: CREATOR,
		creator: { uid: CREATOR, displayName: 'Creator' },
		createdAt: 1,
		lastUpdate: 1,
		consensus: 0,
		...overrides,
	} as Statement;
}

function seedAdmin(uid: string, statementId: string, extra: Record<string, unknown> = {}): void {
	fake.seed(Collections.statementsSubscribe, `${uid}--${statementId}`, {
		userId: uid,
		statementId,
		role: Role.admin,
		user: { uid: 'whoever-created-it', displayName: 'X' },
		...extra,
	});
}

const subOf = (uid: string) => fake.read(Collections.statementsSubscribe, `${uid}--${NEW}`);

beforeEach(() => {
	fake = createFakeDb();
});

describe('setupAdminsForStatement', () => {
	it('makes the creator, the top-parent admins and the parent admins admins of the new statement', async () => {
		seedAdmin('top-admin', TOP);
		seedAdmin('parent-admin', PARENT);
		await setupAdminsForStatement(newStatement());

		for (const uid of [CREATOR, 'top-admin', 'parent-admin']) {
			expect(subOf(uid)).toMatchObject({
				userId: uid,
				statementId: NEW,
				statementsSubscribeId: `${uid}--${NEW}`,
				role: Role.admin,
				getEmailNotification: true,
				getPushNotification: true,
			});
		}
	});

	it('takes the admin uid from userId, never from user.uid', async () => {
		seedAdmin('top-admin', TOP, { user: { uid: 'someone-else', displayName: 'S' } });
		await setupAdminsForStatement(newStatement());
		expect(subOf('top-admin')).toBeDefined();
		expect(subOf('someone-else')).toBeUndefined();
	});

	it('skips forged docs whose id disagrees with their fields (way A / way B)', async () => {
		// id names another statement, fields claim TOP
		fake.seed(Collections.statementsSubscribe, `evil--own-statement`, {
			userId: 'evil',
			statementId: TOP,
			role: Role.admin,
		});
		// id names TOP but userId is someone else
		fake.seed(Collections.statementsSubscribe, `evil2--${TOP}`, {
			userId: 'victim',
			statementId: TOP,
			role: Role.admin,
		});
		await setupAdminsForStatement(newStatement());
		expect(subOf('evil')).toBeUndefined();
		expect(subOf('evil2')).toBeUndefined();
		expect(subOf('victim')).toBeUndefined();
		expect(subOf(CREATOR)).toBeDefined();
	});

	it('handles more inherited admins than an `in` query allows, capped at the limit', async () => {
		const many = MAX_INHERITED_ADMINS + 5;
		for (let i = 0; i < many; i++) seedAdmin(`admin-${String(i).padStart(2, '0')}`, TOP);
		await setupAdminsForStatement(newStatement());
		const written = [...(fake.store.get(Collections.statementsSubscribe)?.keys() ?? [])].filter(
			(id) => id.endsWith(`--${NEW}`),
		);
		expect(written).toHaveLength(MAX_INHERITED_ADMINS + 1);
		expect(subOf(CREATOR)).toBeDefined();
	});

	it('only the creator for a top-level statement', async () => {
		await setupAdminsForStatement(
			newStatement({ statementId: TOP, parentId: 'top', topParentId: TOP, parents: [] }),
		);
		const ids = [...(fake.store.get(Collections.statementsSubscribe)?.keys() ?? [])];
		expect(ids).toEqual([`${CREATOR}--${TOP}`]);
	});
});
