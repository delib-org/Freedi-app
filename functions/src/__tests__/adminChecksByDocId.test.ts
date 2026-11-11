/**
 * The admin gates of integrateSimilarStatements, popperHebbian improveProposal,
 * summarizeDiscussion and synthesizeIdeas read the caller's subscription by doc
 * id (`hasAdminSubscription`) and fail closed. Each gate is driven against an
 * in-memory Firestore, so these tests observe who is let through, not how.
 */
import { Collections, Statement } from '@freedi/shared-types';
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
jest.mock('firebase-functions', () => ({
	logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock('firebase-functions/v1', () => ({
	logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock('../utils/errorHandling', () => ({ logError: jest.fn() }));
jest.mock('../config/gemini', () => ({}));
jest.mock('../helpers', () => ({ getParagraphsText: jest.fn() }));
jest.mock('../deliberation/records', () => ({ stampWorkflowSummary: jest.fn() }));
jest.mock('../integrate/performIntegration', () => ({ performIntegration: jest.fn() }));
jest.mock('../integrate/reverseIntegration', () => ({ reverseIntegration: jest.fn() }));
jest.mock('../services/embedding-cache-service', () => ({ embeddingCache: {} }));
jest.mock('../services/similarity-grouping-service', () => ({}));
jest.mock('../services/semantic-equivalence-service', () => ({}));
jest.mock('../services/verdict-cache-service', () => ({}));
jest.mock('../synthesis/derivedDocs', () => ({}));
jest.mock('../condensation/aggregation', () => ({}));
jest.mock('../synthesis/scoring', () => ({}));
jest.mock('../synthesis/candidateClusters', () => ({}));
jest.mock('../synthesis/twoTierJudge', () => ({}));
jest.mock('../synthesis/featureFlags', () => ({}));
jest.mock('p-limit', () => ({ __esModule: true, default: () => undefined }));

import type { Firestore } from 'firebase-admin/firestore';
import { isIntegrationAdmin } from '../fn_integrateSimilarStatements';
import { canImproveProposal } from '../fn_popperHebbian_improveProposal';
import { canSummarize } from '../fn_summarizeDiscussion';
import { assertAdmin } from '../fn_synthesizeIdeas';
import { logError } from '../utils/errorHandling';

const TOP = 'top-1';
const Q = 'question-1';
const ADMIN = 'admin-1';
const OTHER = 'someone-else';

let fake: FakeDb;
const firestore = (): Firestore => fake.db as unknown as Firestore;

function seedSub(uid: string, statementId: string, role: string): void {
	fake.seed(Collections.statementsSubscribe, `${uid}--${statementId}`, {
		userId: uid,
		statementId,
		role,
	});
}

function breakLookups(): void {
	jest.spyOn(fake.db, 'getAll').mockRejectedValue(new Error('unavailable'));
}

beforeEach(() => {
	fake = createFakeDb();
	jest.clearAllMocks();
});

describe('integrateSimilarStatements admin gate', () => {
	const check = (uid: string, id: string | undefined = TOP): Promise<boolean> =>
		isIntegrationAdmin(firestore(), uid, id, 'test.integrate');

	it.each(['admin', 'creator'])('lets a %s of the top parent through', async (role) => {
		seedSub(ADMIN, TOP, role);
		await expect(check(ADMIN)).resolves.toBe(true);
	});

	it('denies a plain member, a stranger and a missing subscription', async () => {
		seedSub(OTHER, TOP, 'member');
		await expect(check(OTHER)).resolves.toBe(false);
		await expect(check(ADMIN)).resolves.toBe(false);
	});

	it('denies a doc stored under another id that merely claims the statement', async () => {
		fake.seed(Collections.statementsSubscribe, 'random-id', {
			userId: ADMIN,
			statementId: TOP,
			role: 'admin',
		});
		await expect(check(ADMIN)).resolves.toBe(false);
	});

	it('denies when there is no top parent id', async () => {
		await expect(isIntegrationAdmin(firestore(), ADMIN, undefined, 'test.integrate')).resolves.toBe(
			false,
		);
	});

	it('denies and logs with context when the lookup fails', async () => {
		seedSub(ADMIN, TOP, 'admin');
		breakLookups();
		await expect(check(ADMIN)).resolves.toBe(false);
		expect(logError).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({ operation: 'test.integrate', userId: ADMIN, statementId: TOP }),
		);
	});
});

describe('popperHebbian improveProposal gate', () => {
	const proposal = (over: Partial<Statement> = {}): Statement =>
		({ statementId: 'p-1', creatorId: 'author', topParentId: TOP, ...over }) as Statement;
	const check = (uid: string, statement: Statement): Promise<boolean> =>
		canImproveProposal(firestore(), statement, uid);

	it('lets the creator through without any subscription', async () => {
		await expect(check('author', proposal())).resolves.toBe(true);
	});

	it('lets an admin of the top parent through (the old oderId field never matched)', async () => {
		seedSub(ADMIN, TOP, 'admin');
		await expect(check(ADMIN, proposal())).resolves.toBe(true);
	});

	it('denies a non-admin and an admin of some other group', async () => {
		seedSub(OTHER, TOP, 'member');
		seedSub(ADMIN, 'other-group', 'admin');
		await expect(check(OTHER, proposal())).resolves.toBe(false);
		await expect(check(ADMIN, proposal())).resolves.toBe(false);
	});

	it('denies a non-creator when the proposal has no top parent', async () => {
		await expect(check(ADMIN, proposal({ topParentId: undefined }))).resolves.toBe(false);
	});

	it('denies a non-creator and logs when the lookup fails, but still lets the creator in', async () => {
		seedSub(ADMIN, TOP, 'admin');
		breakLookups();
		await expect(check(ADMIN, proposal())).resolves.toBe(false);
		expect(logError).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({ userId: ADMIN, statementId: 'p-1' }),
		);
		await expect(check('author', proposal())).resolves.toBe(true);
	});
});

describe('summarizeDiscussion gate', () => {
	const question = (over: Partial<Statement> = {}): Statement =>
		({ creatorId: 'author', topParentId: TOP, ...over }) as Statement;
	const check = (uid: string, q: Statement): Promise<boolean> =>
		canSummarize(firestore(), q, Q, uid);

	it('lets the creator through', async () => {
		await expect(check('author', question())).resolves.toBe(true);
	});

	it('lets an admin of the top parent through', async () => {
		seedSub(ADMIN, TOP, 'admin');
		await expect(check(ADMIN, question())).resolves.toBe(true);
	});

	it('lets an admin of the question itself through (single hub question)', async () => {
		seedSub(ADMIN, Q, 'creator');
		await expect(check(ADMIN, question())).resolves.toBe(true);
	});

	it('works for a top-level question that is its own top parent', async () => {
		seedSub(ADMIN, Q, 'admin');
		await expect(check(ADMIN, question({ topParentId: undefined }))).resolves.toBe(true);
		await expect(check(OTHER, question({ topParentId: Q }))).resolves.toBe(false);
	});

	it('denies a member and a stranger', async () => {
		seedSub(OTHER, TOP, 'member');
		await expect(check(OTHER, question())).resolves.toBe(false);
		await expect(check(ADMIN, question())).resolves.toBe(false);
	});

	it('denies and logs when the lookup fails', async () => {
		seedSub(ADMIN, TOP, 'admin');
		breakLookups();
		await expect(check(ADMIN, question())).resolves.toBe(false);
		expect(logError).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({ operation: 'summarizeDiscussion.adminCheck', userId: ADMIN }),
		);
	});
});

describe('synthesizeIdeas assertAdmin', () => {
	const run = (uid: string): Promise<Statement> => assertAdmin(Q, uid, firestore());

	beforeEach(() => {
		fake.seed(Collections.statements, Q, { statementId: Q, topParentId: TOP });
	});

	it('returns the parent statement for an admin of the top parent', async () => {
		seedSub(ADMIN, TOP, 'admin');
		await expect(run(ADMIN)).resolves.toMatchObject({ statementId: Q });
	});

	it('falls back to the statement itself when it is the root', async () => {
		fake.seed(Collections.statements, Q, { statementId: Q });
		seedSub(ADMIN, Q, 'admin');
		await expect(run(ADMIN)).resolves.toMatchObject({ statementId: Q });
	});

	it('denies a non-admin with permission-denied', async () => {
		seedSub(OTHER, TOP, 'member');
		await expect(run(OTHER)).rejects.toMatchObject({ code: 'permission-denied' });
		await expect(run(ADMIN)).rejects.toMatchObject({ code: 'permission-denied' });
	});

	it('reports a missing statement as not-found', async () => {
		fake.store.get(Collections.statements)?.delete(Q);
		await expect(run(ADMIN)).rejects.toMatchObject({ code: 'not-found' });
	});

	it('denies with unavailable when the lookup fails', async () => {
		seedSub(ADMIN, TOP, 'admin');
		breakLookups();
		await expect(run(ADMIN)).rejects.toMatchObject({ code: 'unavailable' });
	});
});
