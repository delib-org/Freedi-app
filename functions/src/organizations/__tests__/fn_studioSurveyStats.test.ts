import { Collections, OrganizationRole } from '@freedi/shared-types';
import { asHandler, expectHttpsError, fakeDbFrom, makeRequest } from './testUtils';

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
jest.mock('../../db', () => {
	const { createFakeDb } = jest.requireActual('./fakeFirestore');

	return { db: createFakeDb() };
});
jest.mock('../../utils/httpAuth', () => ({ isSystemAdmin: jest.fn(async () => false) }));

import * as dbModule from '../../db';
import { fn_studioSurveyStats } from '../fn_studioSurveyStats';

const db = fakeDbFrom(dbModule);
const stats = asHandler<
	Record<string, unknown>,
	Record<string, { entered: number; responded: number; completed: number }>
>(fn_studioSurveyStats);

const ORG = 'org1';
const SURVEY = 'survey_1_abc';
const alice = { uid: 'alice', email: 'alice@example.com', name: 'Alice' };
const bob = { uid: 'bob', email: 'bob@example.com', name: 'Bob' };

function seedMember(uid: string, role: OrganizationRole): void {
	db.seed(Collections.organizationMembers, `${ORG}--${uid}`, {
		memberId: `${ORG}--${uid}`,
		organizationId: ORG,
		userId: uid,
		email: `${uid}@example.com`,
		displayName: uid,
		role,
		addedAt: 1,
		addedBy: 'alice',
		lastUpdate: 1,
	});
}

function seedLink(surveyId: string | undefined, statementId = 'q1'): void {
	db.seed(Collections.organizationActivities, `${ORG}--${statementId}`, {
		activityId: `${ORG}--${statementId}`,
		organizationId: ORG,
		statementId,
		statementTitle: 'A question',
		addedBy: 'alice',
		addedByDisplayName: 'Alice',
		addedAt: 1,
		lastUpdate: 1,
		...(surveyId ? { surveyId } : {}),
	});
}

let progressId = 0;
function seedProgress(data: Record<string, unknown>): void {
	progressId += 1;
	db.seed(Collections.surveyProgress, `p${progressId}`, { surveyId: SURVEY, ...data });
}

beforeEach(() => {
	db.reset();
	progressId = 0;
	seedMember('alice', OrganizationRole.owner);
	seedLink(SURVEY);
});

describe('fn_studioSurveyStats', () => {
	it('counts everyone who opened it, answered, and finished', () => {
		seedProgress({}); // opened only
		seedProgress({ currentQuestionIndex: 2 }); // answered
		seedProgress({ completedQuestionIds: ['q1'] }); // answered
		seedProgress({ isCompleted: true }); // answered + finished

		return stats(makeRequest({ organizationId: ORG, surveyIds: [SURVEY] }, alice)).then((r) => {
			expect(r[SURVEY]).toEqual({ entered: 4, responded: 3, completed: 1 });
		});
	});

	it('does not count someone who only landed on it as having answered', async () => {
		seedProgress({ currentQuestionIndex: 0 });

		const r = await stats(makeRequest({ organizationId: ORG, surveyIds: [SURVEY] }, alice));

		expect(r[SURVEY]).toEqual({ entered: 1, responded: 0, completed: 0 });
	});

	it('leaves test runs out, as the MC admin screens do', async () => {
		seedProgress({ isCompleted: true });
		seedProgress({ isCompleted: true, isTestData: true });

		const r = await stats(makeRequest({ organizationId: ORG, surveyIds: [SURVEY] }, alice));

		expect(r[SURVEY]).toEqual({ entered: 1, responded: 1, completed: 1 });
	});

	it('reports zeroes for a survey nobody has opened', async () => {
		const r = await stats(makeRequest({ organizationId: ORG, surveyIds: [SURVEY] }, alice));

		expect(r[SURVEY]).toEqual({ entered: 0, responded: 0, completed: 0 });
	});

	it('refuses to report on a survey this organization has not linked', async () => {
		seedProgress({ isCompleted: true });

		const r = await stats(
			makeRequest({ organizationId: ORG, surveyIds: ['survey_2_guessed'] }, alice),
		);

		expect(r).toEqual({});
	});

	it('rejects a caller who is not an org admin', async () => {
		seedMember('bob', OrganizationRole.viewer);

		await expectHttpsError(
			stats(makeRequest({ organizationId: ORG, surveyIds: [SURVEY] }, bob)),
			'permission-denied',
		);
	});

	it('rejects a malformed request', async () => {
		await expectHttpsError(
			stats(makeRequest({ organizationId: ORG, surveyIds: 'nope' }, alice)),
			'invalid-argument',
		);
	});
});
