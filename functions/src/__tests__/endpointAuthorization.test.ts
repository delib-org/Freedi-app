import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response } from 'firebase-functions/v1';
import { batchUpdates, docs, makeRes } from './helpers/fakeFirestore';

/**
 * Handlers behind the auth gate. Every destructive endpoint must refuse a signed
 * in stranger, and identity must come from the verified uid, not from the body.
 */

jest.mock('../index', () => {
	const fake =
		jest.requireActual<typeof import('./helpers/fakeFirestore')>('./helpers/fakeFirestore');

	return { db: fake.fakeDb };
});
jest.mock('../db', () => {
	const fake =
		jest.requireActual<typeof import('./helpers/fakeFirestore')>('./helpers/fakeFirestore');

	return { db: fake.fakeDb };
});
jest.mock('firebase-admin/firestore', () => {
	const fake =
		jest.requireActual<typeof import('./helpers/fakeFirestore')>('./helpers/fakeFirestore');

	return {
		getFirestore: () => fake.fakeDb,
		FieldValue: {
			increment: (n: number) => n,
			arrayUnion: (x: unknown) => x,
			serverTimestamp: () => 0,
		},
		Timestamp: { fromMillis: (ms: number) => ms },
	};
});
jest.mock('firebase-functions/v1', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), log: jest.fn() },
}));
jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), log: jest.fn() },
}));

const mockPasses = jest.fn<() => Promise<boolean>>();
jest.mock('../utils/rateLimit', () => ({
	passesHttpRateLimit: () => mockPasses(),
	reserveWindowSlot: jest.fn(async () => undefined),
	API_RATE_LIMITS_COLLECTION: 'apiRateLimits',
}));

const mockGenerate = jest.fn<() => Promise<{ response: { text: () => string } }>>();
jest.mock('../config/gemini', () => ({
	GEMINI_MODEL: 'test-model',
	LLM_MODEL_HEAVY: 'test-heavy',
	getGenAI: () => ({ getGenerativeModel: () => ({ generateContent: mockGenerate }) }),
}));
jest.mock('../utils/emailTransporter', () => ({
	getEmailTransporter: jest.fn(async () => ({
		sendMail: jest.fn(async () => ({ messageId: 'm' })),
	})),
}));
jest.mock('googleapis', () => ({ google: {} }));

import { sendEmailToSubscribers, addEmailSubscriber } from '../fn_emailNotifications';
import { getCluster, recoverLastSnapshot } from '../fn_clusters';
import {
	createRoomAssignments,
	deleteRoomAssignments,
	getMyRoomAssignment,
	notifyRoomParticipants,
} from '../fn_roomAssignment';
import { clearAllRoomsForParent, splitJoinedOption } from '../fn_splitJoinedOption';
import { importGoogleDoc } from '../fn_importGoogleDocs';
import { requireStatementAdmin } from '../utils/httpAuth';

const OWNER = 'owner-uid';
const STRANGER = 'stranger-uid';

type Handler = (req: Request, res: Response, uid: string) => Promise<unknown>;

function run(handler: Handler, uid: string, body: Record<string, unknown>) {
	const res = makeRes();
	const req = { method: 'POST', headers: {}, body, query: body } as unknown as Request;

	return handler(req, res as unknown as Response, uid).then(() => res);
}

function seedQuestion(): void {
	docs.clear();
	batchUpdates.length = 0;
	docs.set('statements/q1', {
		statementId: 'q1',
		statement: 'A question',
		statementType: 'question',
		creatorId: OWNER,
		parentId: 'top',
		topParentId: 'q1',
	});
	docs.set('roomsSettings/s1', { settingsId: 's1', statementId: 'q1', topParentId: 'q1' });
	docs.set('statements/o1', {
		statementId: 'o1',
		statement: 'An option',
		statementType: 'option',
		creatorId: STRANGER,
		parentId: 'q1',
		topParentId: 'q1',
		joined: ['a', 'b', 'c', 'd'].map((uid) => ({ uid, displayName: uid })),
		createdAt: 1,
		lastUpdate: 1,
		consensus: 0,
		creator: { displayName: 'd', uid: STRANGER },
	});
}

beforeEach(() => {
	jest.clearAllMocks();
	seedQuestion();
	mockPasses.mockResolvedValue(true);
});

describe.each<[string, Handler, Record<string, unknown>]>([
	[
		'sendEmailToSubscribers',
		sendEmailToSubscribers,
		{ statementId: 'q1', subject: 's', message: 'm' },
	],
	['getCluster', getCluster, { statementId: 'q1' }],
	['recoverLastSnapshot', recoverLastSnapshot, { snapshotId: 'q1' }],
	['createRoomAssignments', createRoomAssignments, { statementId: 'q1', roomSize: 3 }],
	['deleteRoomAssignments', deleteRoomAssignments, { settingsId: 's1' }],
	['notifyRoomParticipants', notifyRoomParticipants, { settingsId: 's1' }],
	[
		'splitJoinedOption',
		splitJoinedOption,
		{ optionStatementId: 'o1', parentStatementId: 'q1', roomSize: 2 },
	],
	['clearAllRoomsForParent', clearAllRoomsForParent, { parentStatementId: 'q1' }],
	[
		'importGoogleDoc',
		importGoogleDoc,
		{ documentUrl: 'https://docs.google.com/document/d/abc/edit', statementId: 'q1' },
	],
])('%s', (_name, handler, body) => {
	it('refuses a signed-in stranger with 403, even with a forged adminId', async () => {
		const res = await run(handler, STRANGER, { ...body, adminId: OWNER, userId: OWNER });

		expect(res.statusCode).toBe(403);
	});

	it('does not refuse the owner', async () => {
		const res = await run(handler, OWNER, body);

		expect(res.statusCode).not.toBe(403);
	});
});

describe('requireStatementAdmin', () => {
	it('does not make an option author an admin of their own option', async () => {
		const res = makeRes();

		await expect(
			requireStatementAdmin(res as unknown as Response, STRANGER, 'o1', 'test'),
		).resolves.toBeNull();
		expect(res.statusCode).toBe(403);
	});

	it('grants the question owner authority over an option under it', async () => {
		const res = makeRes();

		await expect(
			requireStatementAdmin(res as unknown as Response, OWNER, 'o1', 'test'),
		).resolves.toMatchObject({ statementId: 'o1' });
	});

	it('honours an admin subscription read by its document id', async () => {
		docs.set(`statementsSubscribe/${STRANGER}--q1`, { role: 'statement-creator' });
		const res = makeRes();

		await expect(
			requireStatementAdmin(res as unknown as Response, STRANGER, 'q1', 'test'),
		).resolves.toMatchObject({ statementId: 'q1' });
	});

	it('does not honour the literal role "creator" a client can self-assign', async () => {
		docs.set(`statementsSubscribe/${STRANGER}--q1`, { role: 'creator' });
		const res = makeRes();

		await expect(
			requireStatementAdmin(res as unknown as Response, STRANGER, 'q1', 'test'),
		).resolves.toBeNull();
		expect(res.statusCode).toBe(403);
	});

	it('returns 404 for an unknown statement', async () => {
		const res = makeRes();

		await requireStatementAdmin(res as unknown as Response, OWNER, 'missing', 'test');
		expect(res.statusCode).toBe(404);
	});
});

describe('getCluster', () => {
	it('never updates an id the model invented', async () => {
		docs.set('statements/c1', {
			statementId: 'c1',
			statement: 'child',
			parentId: 'q1',
			statementType: 'option',
			creatorId: 'x',
			topParentId: 'q1',
			createdAt: 1,
			lastUpdate: 1,
			consensus: 0,
			creator: { displayName: 'd', uid: 'x' },
		});
		mockGenerate.mockResolvedValue({
			response: {
				text: () =>
					JSON.stringify([
						{
							groupName: 'g',
							statements: [
								{ statement: 'real', statementId: 'c1' },
								{ statement: 'invented', statementId: 'victim-in-another-discussion' },
							],
						},
					]),
			},
		});

		const res = await run(getCluster, OWNER, { statementId: 'q1' });

		expect(res.statusCode).toBe(200);
		expect(batchUpdates).toEqual(['statements/c1']);
	});

	it('spends the AI budget only after the admin check passes', async () => {
		await run(getCluster, STRANGER, { statementId: 'q1' });

		expect(mockPasses).not.toHaveBeenCalled();
	});
});

describe('sendEmailToSubscribers', () => {
	it('rejects a javascript: button URL', async () => {
		const res = await run(sendEmailToSubscribers, OWNER, {
			statementId: 'q1',
			subject: 's',
			message: 'm',
			buttonUrl: 'javascript:alert(1)',
		});

		expect(res.statusCode).toBe(400);
	});
});

describe('addEmailSubscriber', () => {
	it('attributes the subscription to the verified uid, not the body userId', async () => {
		const res = await run(addEmailSubscriber, STRANGER, {
			email: 'person@example.com',
			statementId: 'q1',
			userId: OWNER,
		});

		expect(res.statusCode).toBe(200);
		const stored = [...docs.entries()].find(([path]) => path.startsWith('emailSubscribers/'));
		expect(stored?.[1].userId).toBe(STRANGER);
	});
});

describe('getMyRoomAssignment', () => {
	it('looks up the caller, ignoring a userId in the query', async () => {
		docs.set('roomsSettings/s2', { settingsId: 's2', statementId: 'q2', status: 'active' });
		docs.set('roomParticipants/s2--victim', { userId: 'victim', roomNumber: 7 });

		const res = await run(getMyRoomAssignment, 'someone-else', {
			statementId: 'q2',
			userId: 'victim',
		});

		expect(res.body).toEqual({ hasAssignment: false });
	});
});
