import { Collections } from '@freedi/shared-types';
import { asHandler, expectHttpsError, fakeDbFrom, makeRequest } from '../../__tests__/testUtils';

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
jest.mock('../../../db', () => {
	const { createFakeDb } = jest.requireActual('../../__tests__/fakeFirestore');

	return { db: createFakeDb() };
});
jest.mock('../../../utils/httpAuth', () => ({ isSystemAdmin: jest.fn(async () => false) }));

import * as dbModule from '../../../db';
import { fn_studioScheduledActionUpsert } from '../fn_studioScheduledActionUpsert';
import { fn_studioScheduledActionCancel } from '../fn_studioScheduledActionCancel';

const db = fakeDbFrom(dbModule);
const upsert = asHandler<Record<string, unknown>, { scheduledActionId: string }>(
	fn_studioScheduledActionUpsert,
);
const cancel = asHandler<Record<string, unknown>, { status: string }>(
	fn_studioScheduledActionCancel,
);
const alice = { uid: 'alice', email: 'alice@example.com', name: 'Alice' };
const TOP = 'top-1';
const CHILD = 'child-1';

describe('scheduled action callables', () => {
	beforeEach(() => {
		db.reset();
		db.seed(Collections.statements, TOP, {
			statementId: TOP,
			statement: 'Top',
			parentId: 'top',
			topParentId: TOP,
			creatorId: 'alice',
			organizationId: 'org1',
		});
		db.seed(Collections.statements, CHILD, {
			statementId: CHILD,
			statement: 'Child',
			parentId: TOP,
			topParentId: TOP,
			creatorId: 'someone-else',
		});
		db.seed(Collections.statementsSubscribe, `alice--${TOP}`, { role: 'admin', userId: 'alice' });
	});

	it('creates a pending action with the resolved scope', async () => {
		const runAt = Date.now() + 3_600_000;
		const { scheduledActionId } = await upsert(
			makeRequest({ statementId: CHILD, action: 'close', runAt }, alice),
		);
		const doc = db.read(Collections.scheduledActions, scheduledActionId);
		expect(doc).toMatchObject({
			statementId: CHILD,
			topParentId: TOP,
			organizationId: 'org1',
			action: 'close',
			runAt,
			status: 'pending',
			source: 'manual',
			createdBy: 'alice',
		});
	});

	it('normalizes a reminder payload', async () => {
		const { scheduledActionId } = await upsert(
			makeRequest(
				{
					statementId: CHILD,
					action: 'nudge',
					runAt: Date.now() + 3_600_000,
					nudge: { message: '  Come back!  ' },
				},
				alice,
			),
		);
		expect(db.read(Collections.scheduledActions, scheduledActionId)?.nudge).toEqual({
			message: 'Come back!',
			audience: 'all',
			channels: ['inApp', 'email'],
		});
	});

	it('edits only pending actions and rejects past times and strangers', async () => {
		const runAt = Date.now() + 3_600_000;
		const { scheduledActionId } = await upsert(
			makeRequest({ statementId: CHILD, action: 'open', runAt }, alice),
		);
		await upsert(
			makeRequest(
				{ scheduledActionId, statementId: CHILD, action: 'freeze', runAt: runAt + 1000 },
				alice,
			),
		);
		expect(db.read(Collections.scheduledActions, scheduledActionId)).toMatchObject({
			action: 'freeze',
			runAt: runAt + 1000,
		});
		await expectHttpsError(
			upsert(makeRequest({ statementId: CHILD, action: 'open', runAt: Date.now() - 1 }, alice)),
			'invalid-argument',
		);
		await expectHttpsError(
			upsert(makeRequest({ statementId: CHILD, action: 'open', runAt }, { uid: 'mallory' })),
			'permission-denied',
		);
		await cancel(makeRequest({ scheduledActionId }, alice));
		await expectHttpsError(
			upsert(makeRequest({ scheduledActionId, statementId: CHILD, action: 'open', runAt }, alice)),
			'failed-precondition',
		);
	});

	it('cancels a pending action once', async () => {
		const { scheduledActionId } = await upsert(
			makeRequest({ statementId: CHILD, action: 'open', runAt: Date.now() + 3_600_000 }, alice),
		);
		const result = await cancel(makeRequest({ scheduledActionId }, alice));
		expect(result.status).toBe('cancelled');
		await expectHttpsError(
			cancel(makeRequest({ scheduledActionId }, alice)),
			'failed-precondition',
		);
		await expectHttpsError(cancel(makeRequest({ scheduledActionId: 'nope' }, alice)), 'not-found');
	});
});
