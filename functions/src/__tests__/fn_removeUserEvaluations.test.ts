import { Collections } from '@freedi/shared-types';
import { createFakeDb, FakeDb } from '../progress/__tests__/fakeDb';

jest.mock('firebase-functions/v2/https', () => ({
	onCall: (_opts: unknown, handler: unknown) => handler,
	HttpsError: class HttpsError extends Error {
		code: string;
		constructor(code: string, message: string) {
			super(message);
			this.code = code;
		}
	},
}));
jest.mock('firebase-functions/v1', () => ({ logger: { warn: jest.fn() } }));
jest.mock('../utils/errorHandling', () => ({ logError: jest.fn() }));

let fake: FakeDb = createFakeDb();
let deleted: string[] = [];

jest.mock('../db', () => ({
	get db() {
		return fake.db;
	},
}));

import { removeUserEvaluations } from '../fn_removeUserEvaluations';
import { logError } from '../utils/errorHandling';

const TOP = 'group-1';
const PARENT = 'mid-1';
const Q = 'question-1';
const ADMIN = 'admin-1';
const TARGET = 'banned-1';

interface Result {
	evaluationsRemoved: number;
	votesRemoved: number;
}

const call = removeUserEvaluations as unknown as (request: {
	auth?: { uid: string };
	data: { statementId?: string; userId?: string };
}) => Promise<Result>;

const asCaller = (uid: string): Promise<Result> =>
	call({ auth: { uid }, data: { statementId: Q, userId: TARGET } });

function seedSub(id: string, data: Record<string, unknown>): void {
	fake.seed(Collections.statementsSubscribe, id, data);
}

function seedStatement(overrides: Record<string, unknown> = {}): void {
	fake.seed(Collections.statements, Q, {
		statementId: Q,
		parentId: PARENT,
		topParentId: TOP,
		creatorId: 'owner',
		...overrides,
	});
}

beforeEach(() => {
	fake = createFakeDb();
	deleted = [];
	const originalBatch = fake.db.batch;
	const withDelete = () => ({
		...originalBatch(),
		delete: (ref: { id: string }) => deleted.push(ref.id),
		commit: async () => undefined,
	});
	fake.db.batch = withDelete as unknown as FakeDb['db']['batch'];
	seedStatement();
	fake.seed(Collections.evaluations, 'e1', { parentId: Q, evaluatorId: TARGET });
	fake.seed(Collections.evaluations, 'e2', { parentId: Q, evaluatorId: 'someone-else' });
	fake.seed(Collections.votes, `${TARGET}--${Q}`, { userId: TARGET });
});

describe('removeUserEvaluations admin check', () => {
	it.each(['admin', 'creator'])('admits role %s on the statement itself', async (role) => {
		seedSub(`${ADMIN}--${Q}`, { userId: ADMIN, statementId: Q, role });
		await expect(asCaller(ADMIN)).resolves.toEqual({ evaluationsRemoved: 1, votesRemoved: 1 });
		expect(deleted).toEqual(['e1', `${TARGET}--${Q}`]);
	});

	it('admits an admin of the top parent', async () => {
		seedSub(`${ADMIN}--${TOP}`, { userId: ADMIN, statementId: TOP, role: 'admin' });
		await expect(asCaller(ADMIN)).resolves.toMatchObject({ evaluationsRemoved: 1 });
	});

	it('admits the statement creator without any subscription', async () => {
		seedStatement({ creatorId: ADMIN });
		await expect(asCaller(ADMIN)).resolves.toMatchObject({ evaluationsRemoved: 1 });
	});

	it('reads one doc per scope id, and only one when the statement is its own top parent', async () => {
		const getAll = jest.spyOn(fake.db, 'getAll');
		await expect(asCaller(ADMIN)).rejects.toMatchObject({ code: 'permission-denied' });
		expect(getAll.mock.calls[0].map((ref) => ref.id)).toEqual([
			`${ADMIN}--${Q}`,
			`${ADMIN}--${TOP}`,
		]);

		getAll.mockClear();
		seedStatement({ topParentId: Q });
		await expect(asCaller(ADMIN)).rejects.toMatchObject({ code: 'permission-denied' });
		expect(getAll.mock.calls[0].map((ref) => ref.id)).toEqual([`${ADMIN}--${Q}`]);
	});

	it.each([
		['member', { userId: ADMIN, statementId: Q, role: 'member' }],
		['statement-creator', { userId: ADMIN, statementId: Q, role: 'statement-creator' }],
		['no userId field', { statementId: Q, role: 'admin' }],
	])('refuses a subscription that is %s and deletes nothing', async (_name, data) => {
		seedSub(`${ADMIN}--${Q}`, data);
		await expect(asCaller(ADMIN)).rejects.toMatchObject({ code: 'permission-denied' });
		expect(deleted).toEqual([]);
	});

	it('fails closed when the subscription doc is missing', async () => {
		await expect(asCaller(ADMIN)).rejects.toMatchObject({ code: 'permission-denied' });
		expect(deleted).toEqual([]);
	});

	it('refuses a doc under another id whose fields claim the statement', async () => {
		seedSub(`${ADMIN}--own`, { userId: ADMIN, statementId: Q, role: 'admin' });
		await expect(asCaller(ADMIN)).rejects.toMatchObject({ code: 'permission-denied' });
		expect(deleted).toEqual([]);
	});

	it('does not count an admin role on an intermediate parent', async () => {
		seedSub(`${ADMIN}--${PARENT}`, { userId: ADMIN, statementId: PARENT, role: 'admin' });
		await expect(asCaller(ADMIN)).rejects.toMatchObject({ code: 'permission-denied' });
	});

	it('reports a missing statement as not-found', async () => {
		fake.store.get(Collections.statements)?.delete(Q);
		await expect(asCaller(ADMIN)).rejects.toMatchObject({ code: 'not-found' });
	});

	it('refuses the unauthenticated and incomplete requests', async () => {
		await expect(call({ data: { statementId: Q, userId: TARGET } })).rejects.toMatchObject({
			code: 'unauthenticated',
		});
		await expect(call({ auth: { uid: ADMIN }, data: { statementId: Q } })).rejects.toMatchObject({
			code: 'invalid-argument',
		});
	});

	it('logs with context and fails closed when the read itself errors', async () => {
		jest.spyOn(fake.db, 'getAll').mockRejectedValueOnce(new Error('unavailable'));
		await expect(asCaller(ADMIN)).rejects.toMatchObject({ code: 'internal' });
		expect(deleted).toEqual([]);
		expect(logError).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({
				operation: 'moderation.removeUserEvaluations',
				userId: ADMIN,
				statementId: Q,
			}),
		);
	});
});
