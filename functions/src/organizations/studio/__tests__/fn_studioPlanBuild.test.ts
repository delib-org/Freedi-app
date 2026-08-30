import { Access, Collections, OrganizationRole, Role, type Statement } from '@freedi/shared-types';
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
import { fn_studioPlanBuild } from '../fn_studioPlanBuild';

const db = fakeDbFrom(dbModule);
const build = asHandler<
	Record<string, unknown>,
	{
		topQuestionId: string;
		activityIds: Record<string, string>;
		surveyIds: string[];
		scheduledActionIds: string[];
	}
>(fn_studioPlanBuild);
const alice = { uid: 'alice', email: 'alice@example.com', name: 'Alice' };
const ORG = 'org1';
const SESSION = 'sess-1';
const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

function seedOrg(): void {
	db.seed(Collections.organizations, ORG, {
		organizationId: ORG,
		name: 'Acme',
		questionCount: 0,
		defaultAccess: Access.openForRegistered,
	});
	db.seed(Collections.organizationMembers, `${ORG}--alice`, {
		memberId: `${ORG}--alice`,
		organizationId: ORG,
		userId: 'alice',
		email: 'alice@example.com',
		displayName: 'Alice',
		role: OrganizationRole.owner,
		addedAt: 1,
		addedBy: 'alice',
		lastUpdate: 1,
	});
}

const newPlan = {
	mainQuestion: { title: 'How should we spend next year’s budget?', description: 'Have your say' },
	activities: [
		{
			tempId: 'a1',
			type: 'crowdSurvey',
			title: 'Which projects should we fund first?',
			description: 'Rate the ideas',
			order: 0,
			openNow: true,
			change: 'add',
			survey: {
				intro: 'Welcome',
				allowParticipantsToAddSuggestions: true,
				minEvaluationsPerQuestion: 4,
				extraQuestions: [{ tempId: 'a1q1', title: 'What is missing from the list?' }],
				seedOptions: [
					'Fund the park first',
					'Fund the park first',
					'Repair the school roof',
					' ',
					'Open a youth club',
					'Plant trees on Main St',
					'Free bus on Saturdays',
					'Fix the sidewalks',
				],
			},
		},
		{
			tempId: 'a2',
			type: 'liveSession',
			title: 'Which proposals do we converge on?',
			order: 1,
			openNow: false,
			change: 'add',
		},
		{
			tempId: 'a3',
			type: 'discussion',
			title: 'What do we decide?',
			order: 2,
			openNow: false,
			change: 'add',
		},
	],
	scheduledActions: [
		{ tempId: 's1', activityTempId: 'a2', action: 'open', at: NOW + 14 * DAY },
		{
			tempId: 's2',
			activityTempId: 'a1',
			action: 'nudge',
			at: NOW + 10 * DAY,
			nudgeMessage: 'Three days left',
		},
		{ tempId: 's3', activityTempId: 'a1', action: 'close', at: NOW + 13 * DAY },
		{ tempId: 's4', activityTempId: 'a1', action: 'freeze', at: NOW - DAY },
	],
	summary: 'Widen, converge, decide.',
};

function seedSession(overrides: Record<string, unknown> = {}): void {
	db.seed(Collections.studioPlanSessions, SESSION, {
		sessionId: SESSION,
		organizationId: ORG,
		organizationName: 'Acme',
		createdBy: 'alice',
		language: 'he',
		uiLanguage: 'he',
		timezone: 'Asia/Jerusalem',
		status: 'ready',
		messages: [],
		currentPlan: newPlan,
		proposedPlan: newPlan,
		planVersion: 2,
		readyToBuild: true,
		userTurns: 3,
		createdAt: 1,
		lastUpdate: 1,
		...overrides,
	});
}

function statements(): Statement[] {
	return [...(db.store.get(Collections.statements)?.values() ?? [])] as unknown as Statement[];
}

describe('fn_studioPlanBuild — new question', () => {
	beforeEach(() => {
		db.reset();
		seedOrg();
		seedSession();
	});

	it('builds the top question, activities, survey and scheduled actions', async () => {
		const result = await build(makeRequest({ sessionId: SESSION }, alice));
		const top = db.read(Collections.statements, result.topQuestionId) as unknown as Statement;
		expect(top.parentId).toBe('top');
		expect(top.organizationId).toBe(ORG);
		expect(top.statement).toBe(newPlan.mainQuestion.title);
		expect(top.description).toBe('Have your say');
		expect(top.membership?.access).toBe(Access.openForRegistered);
		expect(db.read(Collections.statementsSubscribe, `alice--${top.statementId}`)?.role).toBe(
			Role.admin,
		);
		expect(db.read(Collections.organizations, ORG)?.questionCount).toBe(1);
		expect(db.read(Collections.questionProgress, top.statementId)?.entered).toBe(0);

		const a1 = db.read(Collections.statements, result.activityIds.a1) as unknown as Statement;
		const a2 = db.read(Collections.statements, result.activityIds.a2) as unknown as Statement;
		const a3 = db.read(Collections.statements, result.activityIds.a3) as unknown as Statement;
		expect([a1.order, a2.order, a3.order]).toEqual([0, 1, 2]);
		expect(a1.sourceApp).toBe('mass-consensus');
		expect(a1.questionSettings?.questionType).toBe('mass-consensus');
		expect(a1.statementSettings?.questionStatus).toBe('live');
		expect(a1.evaluationSettings?.evaluationUI).toBe('suggestions');
		expect(a2.sourceApp).toBe('join');
		expect(a2.statementSettings?.questionStatus).toBe('frozen');
		expect(a3.sourceApp).toBe('main');
		expect(
			typeof db.read(Collections.statementsSubscribe, `alice--${top.statementId}`)?.openedInJoin,
		).toBe('number');

		const extra = db.read(Collections.statements, result.activityIds.a1q1) as unknown as Statement;
		expect(extra.parentId).toBe(a1.statementId);
		expect(extra.parents).toEqual([top.statementId, a1.statementId]);
		expect(extra.questionSettings?.questionType).toBe('mass-consensus');

		expect(result.surveyIds).toHaveLength(1);
		const survey = db.read(Collections.surveys, result.surveyIds[0]) as Record<string, unknown>;
		expect(survey.status).toBe('active');
		expect(survey.questionIds).toEqual([a1.statementId, extra.statementId]);
		expect(survey.parentStatementId).toBe(top.statementId);
		expect(survey.customIntroText).toBe('Welcome');
		expect(survey.defaultLanguage).toBe('he');
		expect(a1.questionSettings?.massConsensusSurveyId).toBe(result.surveyIds[0]);
		expect(extra.questionSettings?.massConsensusSurveyId).toBe(result.surveyIds[0]);
		expect((a1.statementSettings as Record<string, unknown>).liveSynthEnabled).toBe(true);

		const seeds = statements().filter(
			(s) => s.parentId === a1.statementId && s.statementType === 'option',
		);
		expect(seeds.map((s) => s.statement)).toEqual([
			'Fund the park first',
			'Repair the school roof',
			'Open a youth club',
			'Plant trees on Main St',
			'Free bus on Saturdays',
			'Fix the sidewalks',
		]);
		expect(
			seeds.every(
				(s) =>
					s.sourceApp === 'mass-consensus' &&
					(s as unknown as { seededBy: string }).seededBy === 'studio-ai',
			),
		).toBe(true);
		expect(seeds[0].topParentId).toBe(top.statementId);
		expect(db.read(Collections.statements, a1.statementId)?.numberOfOptions).toBe(6);

		expect(result.scheduledActionIds).toEqual([
			`${SESSION}--s1`,
			`${SESSION}--s2`,
			`${SESSION}--s3`,
		]);
		const s1 = db.read(Collections.scheduledActions, `${SESSION}--s1`) as Record<string, unknown>;
		expect(s1).toMatchObject({
			statementId: a2.statementId,
			topParentId: top.statementId,
			organizationId: ORG,
			action: 'open',
			status: 'pending',
			source: 'plan',
		});
		const s2 = db.read(Collections.scheduledActions, `${SESSION}--s2`) as Record<string, unknown>;
		expect(s2.nudge).toEqual({
			message: 'Three days left',
			audience: 'all',
			channels: ['inApp', 'email'],
		});
		expect(db.read(Collections.scheduledActions, `${SESSION}--s4`)).toBeUndefined();

		const session = db.read(Collections.studioPlanSessions, SESSION) as Record<string, unknown>;
		expect(session.status).toBe('built');
		expect(session.builtStatementId).toBe(top.statementId);
		expect(session.builtPlan).toEqual(newPlan);
		expect((session.proposalDiff as { activitiesAdded: number }).activitiesAdded).toBe(0);
	});

	it('is idempotent: a second call returns the same result without duplicates', async () => {
		const first = await build(makeRequest({ sessionId: SESSION }, alice));
		const count = statements().length;
		const second = await build(makeRequest({ sessionId: SESSION }, alice));
		expect(second.topQuestionId).toBe(first.topQuestionId);
		expect(second.activityIds).toEqual(first.activityIds);
		expect(statements().length).toBe(count);
	});

	it('resumes a failed build from the persisted ids', async () => {
		seedSession({
			status: 'failed',
			build: { topQuestionId: '', activityIds: {}, surveyIds: [], scheduledActionIds: [] },
		});
		const result = await build(makeRequest({ sessionId: SESSION }, alice));
		expect(result.topQuestionId).toBeTruthy();
		expect(Object.keys(result.activityIds)).toEqual(['a1', 'a1q1', 'a2', 'a3']);
	});

	it('rejects a session without a plan, a stranger, and a concurrent build', async () => {
		seedSession({ currentPlan: undefined });
		await expectHttpsError(
			build(makeRequest({ sessionId: SESSION }, alice)),
			'failed-precondition',
		);
		seedSession();
		await expectHttpsError(
			build(makeRequest({ sessionId: SESSION }, { uid: 'bob' })),
			'permission-denied',
		);
		seedSession({ status: 'building', buildStartedAt: Date.now() });
		await expectHttpsError(build(makeRequest({ sessionId: SESSION }, alice)), 'aborted');
	});
});

describe('fn_studioPlanBuild — document + draft', () => {
	beforeEach(() => {
		db.reset();
		seedOrg();
		seedSession({
			currentPlan: {
				mainQuestion: { title: 'How do we live with the dogs?' },
				activities: [
					{
						tempId: 'a1',
						type: 'crowdSurvey',
						title: 'How do we live in peace with the dogs?',
						order: 0,
						openNow: true,
						change: 'add',
					},
					{
						tempId: 'd1',
						type: 'document',
						title: 'Living with dogs — the agreement',
						order: 1,
						openNow: false,
						change: 'add',
						draftFrom: ['a1'],
						draftCutoff: { mode: 'chosen' },
						draftIntent: 'A short policy',
					},
				],
				scheduledActions: [
					{ tempId: 's1', activityTempId: 'a1', action: 'close', at: NOW + 10 * DAY },
					{ tempId: 's2', activityTempId: 'd1', action: 'draft', at: NOW + 10 * DAY + 3_600_000 },
					{ tempId: 's3', activityTempId: 'd1', action: 'open', at: NOW + 12 * DAY },
				],
				summary: 'Question first.',
			},
		});
	});

	it('creates a hidden Sign document and a draft action pointing at the survey', async () => {
		const result = await build(makeRequest({ sessionId: SESSION }, alice));
		const doc = db.read(Collections.statements, result.activityIds.d1) as Record<string, unknown>;
		expect(doc.statementType).toBe('document');
		expect(doc.isDocument).toBe(true);
		expect(doc.sourceApp).toBe('sign');
		expect(doc.order).toBe(1);
		expect(doc.signSettings).toEqual({
			isHidden: true,
			isPublic: true,
			isFrozen: false,
			enableSuggestions: false,
		});
		const draftAction = db.read(Collections.scheduledActions, `${SESSION}--s2`) as Record<
			string,
			unknown
		>;
		expect(draftAction.action).toBe('draft');
		expect(draftAction.statementId).toBe(result.activityIds.d1);
		expect(draftAction.draft).toEqual({
			sourceStatementIds: [result.activityIds.a1],
			cutoff: { mode: 'chosen' },
			language: 'he',
			intent: 'A short policy',
		});
		expect(db.read(Collections.scheduledActions, `${SESSION}--s3`)?.action).toBe('open');
	});
});

describe('fn_studioPlanBuild — existing question', () => {
	const TOP = 'top-existing';
	const EXISTING = 'child-existing';

	beforeEach(() => {
		db.reset();
		seedOrg();
		db.seed(Collections.statements, TOP, {
			statementId: TOP,
			statement: 'Old title',
			statementType: 'question',
			parentId: 'top',
			topParentId: TOP,
			creatorId: 'alice',
			organizationId: ORG,
			createdAt: 1,
			lastUpdate: 1,
		});
		db.seed(Collections.statements, EXISTING, {
			statementId: EXISTING,
			statement: 'Existing survey',
			statementType: 'question',
			parentId: TOP,
			topParentId: TOP,
			creatorId: 'alice',
			order: 0,
			sourceApp: 'mass-consensus',
			questionSettings: { questionType: 'mass-consensus', massConsensusSurveyId: 'survey_old' },
			createdAt: 1,
			lastUpdate: 1,
		});
		seedSession({
			topQuestionId: TOP,
			existingActivities: [
				{ statementId: EXISTING, type: 'crowdSurvey', title: 'Existing survey', order: 0 },
			],
			currentPlan: {
				mainQuestion: { title: 'Old title' },
				activities: [
					{
						tempId: 'e1',
						type: 'crowdSurvey',
						title: 'Existing survey (clearer)',
						order: 0,
						openNow: true,
						change: 'update',
						existingStatementId: EXISTING,
					},
					{
						tempId: 'a1',
						type: 'discussion',
						title: 'What do we decide?',
						order: 1,
						openNow: false,
						change: 'add',
					},
				],
				scheduledActions: [
					{ tempId: 's1', statementId: EXISTING, action: 'close', at: NOW + 5 * DAY },
				],
				summary: 'Add a decision step.',
			},
		});
	});

	it('updates the existing activity, appends the new one after it, keeps the top question', async () => {
		const result = await build(makeRequest({ sessionId: SESSION }, alice));
		expect(result.topQuestionId).toBe(TOP);
		expect(db.read(Collections.statements, EXISTING)?.statement).toBe('Existing survey (clearer)');
		expect(db.read(Collections.statements, EXISTING)?.questionSettings).toMatchObject({
			massConsensusSurveyId: 'survey_old',
		});
		const added = db.read(Collections.statements, result.activityIds.a1) as unknown as Statement;
		expect(added.parentId).toBe(TOP);
		expect(added.order).toBe(1);
		expect(result.surveyIds).toEqual([]);
		expect(db.read(Collections.scheduledActions, `${SESSION}--s1`)).toMatchObject({
			statementId: EXISTING,
			action: 'close',
		});
		expect(db.read(Collections.organizations, ORG)?.questionCount).toBe(0);
	});
});
