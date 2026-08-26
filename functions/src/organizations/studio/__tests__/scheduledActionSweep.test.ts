import { Collections } from '@freedi/shared-types';
import { fakeDbFrom } from '../../__tests__/testUtils';

jest.mock('firebase-functions/v2/scheduler', () => ({
	onSchedule: (_opts: unknown, handler: unknown) => handler,
}));
jest.mock('../../../db', () => {
	const { createFakeDb } = jest.requireActual('../../__tests__/fakeFirestore');

	return { db: createFakeDb() };
});
const sendQuestionNudge = jest.fn((_input: unknown) =>
	Promise.resolve({ sent: 2, inApp: 2, email: 0 }),
);
jest.mock('../../../fn_nudgeQuestionSubscribers', () => ({
	sendQuestionNudge: (input: unknown) => sendQuestionNudge(input),
}));

import * as dbModule from '../../../db';
import { runScheduledActionSweep } from '../scheduledActionSweep';

const db = fakeDbFrom(dbModule);
const NOW = 1_700_000_000_000;
const TOP = 'top-1';
const MC = 'mc-1';
const SURVEY = 'survey_1';

function seedQuestion(id: string, questionStatus: string, surveyId?: string): void {
	db.seed(Collections.statements, id, {
		statementId: id,
		statement: `Q ${id}`,
		statementType: 'question',
		parentId: TOP,
		topParentId: TOP,
		creatorId: 'alice',
		statementSettings: { questionStatus, showEvaluation: true },
		questionSettings: surveyId
			? { questionType: 'mass-consensus', massConsensusSurveyId: surveyId }
			: {},
	});
}

function seedAction(id: string, overrides: Record<string, unknown>): void {
	db.seed(Collections.scheduledActions, id, {
		scheduledActionId: id,
		statementId: MC,
		topParentId: TOP,
		organizationId: 'org1',
		action: 'open',
		runAt: NOW - 1000,
		status: 'pending',
		createdBy: 'alice',
		source: 'plan',
		createdAt: NOW - 10_000,
		lastUpdate: NOW - 10_000,
		...overrides,
	});
}

describe('runScheduledActionSweep', () => {
	beforeEach(() => {
		db.reset();
		sendQuestionNudge.mockClear();
		seedQuestion(MC, 'frozen', SURVEY);
		db.seed(Collections.surveys, SURVEY, { surveyId: SURVEY, status: 'draft', questionIds: [MC] });
	});

	it('opens a due question and activates its survey', async () => {
		seedAction('a1', { action: 'open' });
		const result = await runScheduledActionSweep(NOW);
		expect(result).toEqual({ executed: 1, failed: 0, skipped: 0 });
		expect(
			(db.read(Collections.statements, MC)?.statementSettings as { questionStatus: string })
				.questionStatus,
		).toBe('live');
		expect(db.read(Collections.surveys, SURVEY)?.status).toBe('active');
		const action = db.read(Collections.scheduledActions, 'a1');
		expect(action?.status).toBe('done');
		expect(action?.executedAt).toBe(NOW);
	});

	it('closes a question and its survey', async () => {
		seedAction('a1', { action: 'close' });
		await runScheduledActionSweep(NOW);
		expect(
			(db.read(Collections.statements, MC)?.statementSettings as { questionStatus: string })
				.questionStatus,
		).toBe('closed');
		expect(db.read(Collections.surveys, SURVEY)?.status).toBe('closed');
	});

	it('sends a reminder without the manual cooldown', async () => {
		seedAction('a1', {
			action: 'nudge',
			nudge: { message: 'Two days left!', audience: 'all', channels: ['inApp'] },
		});
		await runScheduledActionSweep(NOW);
		expect(sendQuestionNudge).toHaveBeenCalledTimes(1);
		const input = sendQuestionNudge.mock.calls[0][0] as Record<string, unknown>;
		expect(input.message).toBe('Two days left!');
		expect(input.enforceCooldown).toBe(false);
		expect(input.callerUid).toBe('alice');
		expect(db.read(Collections.scheduledActions, 'a1')?.status).toBe('done');
	});

	it('leaves actions that are not due yet', async () => {
		seedAction('a1', { runAt: NOW + 60_000 });
		const result = await runScheduledActionSweep(NOW);
		expect(result.executed).toBe(0);
		expect(db.read(Collections.scheduledActions, 'a1')?.status).toBe('pending');
	});

	it('skips a fresh running claim and re-runs a stale one', async () => {
		seedAction('fresh', { status: 'running', claimedAt: NOW - 1000 });
		seedAction('stale', { status: 'running', claimedAt: NOW - 11 * 60 * 1000 });
		const result = await runScheduledActionSweep(NOW);
		expect(db.read(Collections.scheduledActions, 'fresh')?.status).toBe('running');
		expect(db.read(Collections.scheduledActions, 'stale')?.status).toBe('done');
		expect(result.executed).toBe(1);
	});

	it('marks an action failed when its question is gone', async () => {
		seedAction('a1', { statementId: 'missing' });
		const result = await runScheduledActionSweep(NOW);
		expect(result.failed).toBe(1);
		const action = db.read(Collections.scheduledActions, 'a1');
		expect(action?.status).toBe('failed');
		expect(String(action?.error)).toContain('missing');
	});
});
