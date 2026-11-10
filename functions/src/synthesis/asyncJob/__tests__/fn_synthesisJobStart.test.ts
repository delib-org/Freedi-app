import { Collections } from '@freedi/shared-types';
import { createFakeDb, FakeDb } from '../../../progress/__tests__/fakeDb';

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
jest.mock('firebase-functions', () => ({ logger: { info: jest.fn() } }));
jest.mock('firebase-functions/v1', () => ({ logger: { warn: jest.fn() } }));
jest.mock('../../featureFlags', () => ({ synthesisFlags: { asyncJobMode: true } }));
jest.mock('../jobState', () => ({
	createJob: jest.fn(async () => 'job-1'),
	requestCancel: jest.fn(),
}));

let fake: FakeDb = createFakeDb();

jest.mock('firebase-admin/firestore', () => ({
	getFirestore: () => fake.db,
}));

import { synthesisJobStart } from '../fn_synthesisJobStart';
import { createJob } from '../jobState';

const Q = 'question-1';
const TOP = 'group-1';
const USER = 'admin-1';

const call = synthesisJobStart as unknown as (request: {
	auth?: { uid: string };
	data: { parentStatementId?: string };
}) => Promise<{ jobId: string; status: string }>;

const start = (uid = USER): Promise<{ jobId: string; status: string }> =>
	call({ auth: { uid }, data: { parentStatementId: Q } });

function seedSub(id: string, data: Record<string, unknown>): void {
	fake.seed(Collections.statementsSubscribe, id, data);
}

beforeEach(() => {
	fake = createFakeDb();
	jest.mocked(createJob).mockClear();
	fake.seed(Collections.statements, Q, { statementId: Q, topParentId: TOP });
});

describe('synthesisJobStart admin check', () => {
	it.each(['admin', 'creator'])('queues a job for role %s on the top parent', async (role) => {
		seedSub(`${USER}--${TOP}`, { userId: USER, statementId: TOP, role });
		await expect(start()).resolves.toEqual({ jobId: 'job-1', status: 'queued' });
		expect(createJob).toHaveBeenCalledWith(
			expect.objectContaining({ questionId: Q, createdBy: USER }),
		);
	});

	it('uses the question itself when it has no topParentId', async () => {
		fake.seed(Collections.statements, Q, { statementId: Q });
		seedSub(`${USER}--${Q}`, { userId: USER, statementId: Q, role: 'admin' });
		await expect(start()).resolves.toMatchObject({ status: 'queued' });
	});

	it.each([
		['member', { userId: USER, statementId: TOP, role: 'member' }],
		['statement-creator', { userId: USER, statementId: TOP, role: 'statement-creator' }],
		['no userId field', { statementId: TOP, role: 'admin' }],
	])('refuses a subscription that is %s and queues nothing', async (_name, data) => {
		seedSub(`${USER}--${TOP}`, data);
		await expect(start()).rejects.toMatchObject({ code: 'permission-denied' });
		expect(createJob).not.toHaveBeenCalled();
	});

	it('fails closed when the subscription doc is missing', async () => {
		await expect(start()).rejects.toMatchObject({ code: 'permission-denied' });
		expect(createJob).not.toHaveBeenCalled();
	});

	it('refuses a doc under another id whose fields claim the top parent', async () => {
		seedSub(`${USER}--own`, { userId: USER, statementId: TOP, role: 'admin' });
		await expect(start()).rejects.toMatchObject({ code: 'permission-denied' });
		expect(createJob).not.toHaveBeenCalled();
	});

	it('does not count an admin role on the question when it has a top parent', async () => {
		seedSub(`${USER}--${Q}`, { userId: USER, statementId: Q, role: 'admin' });
		await expect(start()).rejects.toMatchObject({ code: 'permission-denied' });
	});

	it('reports a missing parent as not-found', async () => {
		await expect(
			call({ auth: { uid: USER }, data: { parentStatementId: 'nope' } }),
		).rejects.toMatchObject({ code: 'not-found' });
	});
});
