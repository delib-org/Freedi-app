import { Collections, Role, Statement, StatementType } from '@freedi/shared-types';
import { createFakeDb, FakeDb } from '../progress/__tests__/fakeDb';

let fake: FakeDb = createFakeDb();

jest.mock('../db', () => ({
	get db() {
		return fake.db;
	},
}));

const mockGetUsers = jest.fn();
jest.mock('firebase-admin/auth', () => ({
	getAuth: () => ({ getUsers: mockGetUsers }),
}));

import {
	MAX_INHERITED_ADMINS,
	PROFILE_LOOKUP_TIMEOUT_MS,
	setupAdminsForStatement,
} from '../setupAdminsForStatement';

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
	mockGetUsers.mockReset();
	mockGetUsers.mockResolvedValue({ users: [], notFound: [] });
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

	it('dates every admin subscription from the statement, so the Members list (ordered by createdAt) shows them', async () => {
		seedAdmin('top-admin', TOP);
		await setupAdminsForStatement(newStatement({ createdAt: 42 }));

		expect(subOf(CREATOR)).toMatchObject({ createdAt: 42 });
		expect(subOf('top-admin')).toMatchObject({ createdAt: 42 });
	});

	it('completes the creator’s own subscription write instead of replacing it', async () => {
		fake.seed(Collections.statementsSubscribe, `${CREATOR}--${NEW}`, {
			userId: CREATOR,
			statementId: NEW,
			role: Role.member,
			tokens: ['push-token'],
			lastReadTimestamp: 7,
		});
		await setupAdminsForStatement(newStatement());

		expect(subOf(CREATOR)).toMatchObject({
			role: Role.admin,
			tokens: ['push-token'],
			lastReadTimestamp: 7,
			createdAt: 1,
		});
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

	describe('the identity on an inherited admin', () => {
		it('holds the real person from usersV2, with no email or other personal field', async () => {
			seedAdmin('top-admin', TOP);
			fake.seed(Collections.users, 'top-admin', {
				uid: 'top-admin',
				displayName: 'Real Host',
				photoURL: 'https://photo/host.png',
				email: 'host@example.org',
				systemAdmin: true,
			});
			await setupAdminsForStatement(newStatement());

			expect(subOf('top-admin')?.user).toEqual({
				uid: 'top-admin',
				displayName: 'Real Host',
				photoURL: 'https://photo/host.png',
				isAnonymous: false,
			});
			expect(mockGetUsers).not.toHaveBeenCalled();
		});

		it('falls back to Auth when usersV2 has no name, keeping only the minimal fields', async () => {
			seedAdmin('top-admin', TOP);
			mockGetUsers.mockResolvedValue({
				users: [
					{
						uid: 'top-admin',
						displayName: 'From Auth',
						email: 'a@example.org',
						providerData: [{ providerId: 'google.com' }],
					},
				],
				notFound: [],
			});
			await setupAdminsForStatement(newStatement());

			expect(subOf('top-admin')?.user).toEqual({
				uid: 'top-admin',
				displayName: 'From Auth',
				isAnonymous: false,
			});
		});

		it('never carries the creator: no profile anywhere leaves a nameless identity', async () => {
			seedAdmin('top-admin', TOP);
			await setupAdminsForStatement(newStatement());

			expect(subOf('top-admin')?.user).toEqual({
				uid: 'top-admin',
				displayName: '',
				isAnonymous: true,
			});
		});

		it('still sets up the admin when the Auth lookup fails', async () => {
			seedAdmin('top-admin', TOP);
			mockGetUsers.mockRejectedValue(new Error('auth down'));
			await setupAdminsForStatement(newStatement());

			expect(subOf('top-admin')).toMatchObject({
				role: Role.admin,
				user: { uid: 'top-admin', displayName: '' },
			});
		});

		it('a hung lookup neither delays nor loses the admin doc: nameless, logged, still written', async () => {
			const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
			jest.useFakeTimers();
			try {
				seedAdmin('top-admin', TOP);
				mockGetUsers.mockReturnValue(new Promise(() => undefined));
				const setup = setupAdminsForStatement(newStatement());
				await jest.advanceTimersByTimeAsync(PROFILE_LOOKUP_TIMEOUT_MS);
				await setup;

				expect(subOf('top-admin')).toMatchObject({
					role: Role.admin,
					createdAt: 1,
					user: { uid: 'top-admin', displayName: '', isAnonymous: true },
				});
				expect(subOf(CREATOR)).toBeDefined();
				expect(logged.mock.calls.flat().join(' ')).toContain('timed out');
			} finally {
				jest.useRealTimers();
				logged.mockRestore();
			}
		});

		it('leaves the creator their own identity, without a lookup', async () => {
			await setupAdminsForStatement(newStatement());

			expect(subOf(CREATOR)?.user).toEqual({ uid: CREATOR, displayName: 'Creator' });
			expect(mockGetUsers).not.toHaveBeenCalled();
		});
	});

	it('only the creator for a top-level statement', async () => {
		await setupAdminsForStatement(
			newStatement({ statementId: TOP, parentId: 'top', topParentId: TOP, parents: [] }),
		);
		const ids = [...(fake.store.get(Collections.statementsSubscribe)?.keys() ?? [])];
		expect(ids).toEqual([`${CREATOR}--${TOP}`]);
	});
});
