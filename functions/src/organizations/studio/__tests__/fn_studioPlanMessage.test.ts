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
const runPlannerTurn = jest.fn();
jest.mock('../plannerTurn', () => ({
	runPlannerTurn: (...args: unknown[]) => runPlannerTurn(...args),
	PLANNER_MODEL: 'test-model',
}));

import * as dbModule from '../../../db';
import { fn_studioPlanMessage } from '../fn_studioPlanMessage';

const db = fakeDbFrom(dbModule);
const send = asHandler<Record<string, unknown>, { planVersion: number; readyToBuild: boolean }>(
	fn_studioPlanMessage,
);
const alice = { uid: 'alice', email: 'alice@example.com', name: 'Alice' };
const SESSION = 'sess-1';

const plan = {
	mainQuestion: { title: 'How should we spend the budget?' },
	activities: [
		{
			tempId: 'a1',
			type: 'crowdSurvey',
			title: 'Which ideas?',
			order: 0,
			openNow: true,
			change: 'add',
		},
	],
	scheduledActions: [],
	summary: 'Widen then decide.',
};

function seedSession(overrides: Record<string, unknown> = {}): void {
	db.seed(Collections.studioPlanSessions, SESSION, {
		sessionId: SESSION,
		organizationId: 'org1',
		organizationName: 'Acme',
		createdBy: 'alice',
		language: 'en',
		uiLanguage: 'en',
		timezone: 'Asia/Jerusalem',
		status: 'draft',
		messages: [{ role: 'assistant', content: 'Tell me…', createdAt: 1 }],
		planVersion: 0,
		readyToBuild: false,
		userTurns: 0,
		createdAt: 1,
		lastUpdate: 1,
		...overrides,
	});
}

function turn(overrides: Record<string, unknown> = {}) {
	return {
		reply: 'Here is a plan.',
		readyToBuild: false,
		diagnosis: { decisionType: 'allocate' },
		patternId: 'budgetAllocation',
		missingCritical: [],
		plan,
		problems: [],
		blocking: false,
		...overrides,
	};
}

describe('fn_studioPlanMessage', () => {
	beforeEach(() => {
		db.reset();
		runPlannerTurn.mockReset();
		seedSession();
	});

	it('appends the turn, stores the plan and bumps the version', async () => {
		runPlannerTurn.mockResolvedValue(turn());
		const result = await send(
			makeRequest({ sessionId: SESSION, message: 'We need to split 1M between 5 projects' }, alice),
		);
		expect(result.planVersion).toBe(1);
		expect(result.readyToBuild).toBe(false);
		const session = db.read(Collections.studioPlanSessions, SESSION) as Record<string, unknown>;
		expect((session.messages as unknown[]).length).toBe(3);
		expect(session.userTurns).toBe(1);
		expect(session.status).toBe('draft');
		expect(session.patternId).toBe('budgetAllocation');
		expect((session.diagnosis as { decisionType: string }).decisionType).toBe('allocate');
		expect(session.currentPlan).toEqual(plan);
		expect(session.proposedPlan).toEqual(plan);
		expect(db.read(Collections.studioRateLimits, 'alice')?.count).toBe(1);
	});

	it('keeps the version when the plan did not change and marks ready', async () => {
		seedSession({ currentPlan: plan, planVersion: 3, userTurns: 3 });
		runPlannerTurn.mockResolvedValue(turn({ readyToBuild: true }));
		const result = await send(
			makeRequest({ sessionId: SESSION, message: 'Looks good, build it' }, alice),
		);
		expect(result.planVersion).toBe(3);
		expect(result.readyToBuild).toBe(true);
		expect(db.read(Collections.studioPlanSessions, SESSION)?.status).toBe('ready');
	});

	it('detects Hebrew and stores it as the session language', async () => {
		runPlannerTurn.mockResolvedValue(turn());
		await send(
			makeRequest(
				{ sessionId: SESSION, message: 'אנחנו צריכים לחלק תקציב בין חמישה פרויקטים' },
				alice,
			),
		);
		expect(db.read(Collections.studioPlanSessions, SESSION)?.language).toBe('he');
	});

	it('never reports ready while the critic blocks the plan', async () => {
		runPlannerTurn.mockResolvedValue(
			turn({ readyToBuild: true, blocking: true, problems: ['past date'] }),
		);
		const result = await send(makeRequest({ sessionId: SESSION, message: 'ok' }, alice));
		expect(result.readyToBuild).toBe(false);
	});

	it('rejects another user, a built session, empty text and the hourly limit', async () => {
		runPlannerTurn.mockResolvedValue(turn());
		await expectHttpsError(
			send(makeRequest({ sessionId: SESSION, message: 'hi' }, { uid: 'bob' })),
			'permission-denied',
		);
		await expectHttpsError(
			send(makeRequest({ sessionId: SESSION, message: '   ' }, alice)),
			'invalid-argument',
		);
		seedSession({ status: 'built' });
		await expectHttpsError(
			send(makeRequest({ sessionId: SESSION, message: 'hi' }, alice)),
			'failed-precondition',
		);
		seedSession();
		db.seed(Collections.studioRateLimits, 'alice', { windowStart: Date.now(), count: 30 });
		await expectHttpsError(
			send(makeRequest({ sessionId: SESSION, message: 'hi' }, alice)),
			'resource-exhausted',
		);
	});
});
