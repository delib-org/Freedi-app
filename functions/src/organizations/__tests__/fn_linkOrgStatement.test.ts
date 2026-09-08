import {
	Collections,
	OrganizationActivity,
	OrganizationRole,
	QuestionProgress,
	Role,
	StatementSubscription,
} from '@freedi/shared-types';
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
import { isSystemAdmin } from '../../utils/httpAuth';
import { fn_linkOrgStatement } from '../fn_linkOrgStatement';
import { fn_renameOrgActivity } from '../fn_renameOrgActivity';
import { fn_unlinkOrgStatement } from '../fn_unlinkOrgStatement';

const db = fakeDbFrom(dbModule);
const mockIsSystemAdmin = isSystemAdmin as jest.MockedFunction<typeof isSystemAdmin>;
const link = asHandler<Record<string, unknown>, { activityId: string; statementId: string }>(
	fn_linkOrgStatement,
);
const rename = asHandler<Record<string, unknown>, { label: string | null }>(fn_renameOrgActivity);
const unlink = asHandler<Record<string, unknown>, { removed: boolean }>(fn_unlinkOrgStatement);

const ORG = 'org1';
const OTHER_ORG = 'org2';
const QUESTION = 'q1';
const alice = { uid: 'alice', email: 'alice@example.com', name: 'Alice' };
const bob = { uid: 'bob', email: 'bob@example.com', name: 'Bob' };

function seedMember(uid: string, role: OrganizationRole, organizationId = ORG): void {
	db.seed(Collections.organizationMembers, `${organizationId}--${uid}`, {
		memberId: `${organizationId}--${uid}`,
		organizationId,
		userId: uid,
		email: `${uid}@example.com`,
		displayName: uid,
		role,
		addedAt: 1,
		addedBy: 'alice',
		lastUpdate: 1,
	});
}

function seedOrg(organizationId = ORG, questionCount = 0): void {
	db.seed(Collections.organizations, organizationId, {
		organizationId,
		name: organizationId,
		status: 'active',
		createdBy: 'alice',
		createdAt: 1,
		lastUpdate: 1,
		questionCount,
	});
}

interface SeedQuestionOptions {
	creatorId?: string;
	organizationId?: string;
	statementType?: string;
	parentId?: string;
	parents?: string[];
}

function seedQuestion(id = QUESTION, options: SeedQuestionOptions = {}): void {
	db.seed(Collections.statements, id, {
		statementId: id,
		statement: 'The real title',
		statementType: options.statementType ?? 'question',
		parentId: options.parentId ?? 'top',
		topParentId: options.parentId ?? id,
		...(options.parents ? { parents: options.parents } : {}),
		creatorId: options.creatorId ?? 'alice',
		creator: { uid: options.creatorId ?? 'alice', displayName: 'Alice' },
		createdAt: 1,
		lastUpdate: 1,
		consensus: 0,
		...(options.organizationId ? { organizationId: options.organizationId } : {}),
	});
}

function seedSubscription(uid: string, statementId: string, role: Role): void {
	db.seed(Collections.statementsSubscribe, `${uid}--${statementId}`, {
		statementsSubscribeId: `${uid}--${statementId}`,
		userId: uid,
		statementId,
		role,
		createdAt: 1,
		lastUpdate: 1,
	});
}

function readActivity(organizationId = ORG, statementId = QUESTION): OrganizationActivity {
	return db.read(
		Collections.organizationActivities,
		`${organizationId}--${statementId}`,
	) as unknown as OrganizationActivity;
}

function readSubscription(uid: string, statementId = QUESTION): StatementSubscription | undefined {
	return db.read(Collections.statementsSubscribe, `${uid}--${statementId}`) as unknown as
		| StatementSubscription
		| undefined;
}

beforeEach(() => {
	db.reset();
	mockIsSystemAdmin.mockReset();
	mockIsSystemAdmin.mockResolvedValue(false);
	seedOrg();
	seedMember('alice', OrganizationRole.owner);
});

describe('fn_linkOrgStatement', () => {
	it('links a question the caller created and stores the board name', async () => {
		seedQuestion();

		const { activityId } = await link(
			makeRequest({ organizationId: ORG, statementId: QUESTION, label: 'Budget round' }, alice),
		);

		expect(activityId).toBe(`${ORG}--${QUESTION}`);
		const activity = readActivity();
		expect(activity.label).toBe('Budget round');
		expect(activity.statementTitle).toBe('The real title');
		expect(activity.organizationId).toBe(ORG);
	});

	it('leaves the statement itself untouched', async () => {
		seedQuestion();
		const before = { ...(db.read(Collections.statements, QUESTION) as Record<string, unknown>) };

		await link(
			makeRequest({ organizationId: ORG, statementId: QUESTION, label: 'Renamed' }, alice),
		);

		expect(db.read(Collections.statements, QUESTION)).toEqual(before);
	});

	it('gives every org admin an admin subscription on the question', async () => {
		seedQuestion();
		seedMember('bob', OrganizationRole.admin);

		await link(makeRequest({ organizationId: ORG, statementId: QUESTION }, alice));

		expect(readSubscription('bob')?.role).toBe(Role.admin);
		expect(readActivity().grantedTo).toContain('bob');
	});

	it('does not record a grant for an admin who already administered the question', async () => {
		seedQuestion();
		seedMember('bob', OrganizationRole.admin);
		seedSubscription('bob', QUESTION, Role.creator);

		await link(makeRequest({ organizationId: ORG, statementId: QUESTION }, alice));

		expect(readActivity().grantedTo).not.toContain('bob');
		expect(readSubscription('bob')?.role).toBe(Role.creator);
	});

	it('bumps the org question counter and seeds progress', async () => {
		seedQuestion();

		await link(makeRequest({ organizationId: ORG, statementId: QUESTION }, alice));

		const org = db.read(Collections.organizations, ORG) as Record<string, unknown>;
		expect(org.questionCount).toBe(1);
		const progress = db.read(Collections.questionProgress, QUESTION) as unknown as QuestionProgress;
		expect(progress.statementId).toBe(QUESTION);
	});

	it("keeps the owning organization on a linked question's progress record", async () => {
		seedQuestion(QUESTION, { organizationId: OTHER_ORG });

		await link(makeRequest({ organizationId: ORG, statementId: QUESTION }, alice));

		const progress = db.read(Collections.questionProgress, QUESTION) as unknown as QuestionProgress;
		expect(progress.organizationId).toBe(OTHER_ORG);
	});

	it('rejects a question created by someone outside the organization', async () => {
		seedQuestion(QUESTION, { creatorId: 'carol' });
		seedMember('bob', OrganizationRole.admin);

		await expectHttpsError(
			link(makeRequest({ organizationId: ORG, statementId: QUESTION }, bob)),
			'permission-denied',
		);
		expect(readActivity()).toBeUndefined();
	});

	it('accepts a question a fellow org admin created', async () => {
		seedMember('bob', OrganizationRole.admin);
		seedQuestion(QUESTION, { creatorId: 'bob' });

		await link(makeRequest({ organizationId: ORG, statementId: QUESTION }, alice));

		expect(readActivity().addedBy).toBe('alice');
	});

	it('accepts a question created by a system admin', async () => {
		seedQuestion(QUESTION, { creatorId: 'root' });
		mockIsSystemAdmin.mockImplementation(async (uid: string) => uid === 'root');

		await link(makeRequest({ organizationId: ORG, statementId: QUESTION }, alice));

		expect(readActivity()).toBeDefined();
	});

	it('accepts a question nested under one an org admin created', async () => {
		seedMember('bob', OrganizationRole.admin);
		seedQuestion('parent-q', { creatorId: 'bob' });
		seedQuestion(QUESTION, { creatorId: 'carol', parentId: 'parent-q' });

		await link(makeRequest({ organizationId: ORG, statementId: QUESTION }, alice));

		expect(readActivity()).toBeDefined();
	});

	it('accepts a question deep under an admin question via the parents chain', async () => {
		seedMember('bob', OrganizationRole.admin);
		seedQuestion('root-q', { creatorId: 'bob' });
		seedQuestion(QUESTION, {
			creatorId: 'carol',
			parentId: 'mid-q',
			parents: ['root-q', 'mid-q'],
		});

		await link(makeRequest({ organizationId: ORG, statementId: QUESTION }, alice));

		expect(readActivity()).toBeDefined();
	});

	it('rejects a question whose ancestors are all outsiders', async () => {
		seedQuestion('parent-q', { creatorId: 'carol' });
		seedQuestion(QUESTION, { creatorId: 'dave', parentId: 'parent-q' });

		await expectHttpsError(
			link(makeRequest({ organizationId: ORG, statementId: QUESTION }, alice)),
			'permission-denied',
		);
	});

	it('rejects a caller who is not an org admin', async () => {
		seedQuestion();
		seedMember('bob', OrganizationRole.viewer);

		await expectHttpsError(
			link(makeRequest({ organizationId: ORG, statementId: QUESTION }, bob)),
			'permission-denied',
		);
	});

	it('rejects a question the organization already owns', async () => {
		seedQuestion(QUESTION, { organizationId: ORG });

		await expectHttpsError(
			link(makeRequest({ organizationId: ORG, statementId: QUESTION }, alice)),
			'already-exists',
		);
	});

	it('rejects a second link of the same question', async () => {
		seedQuestion();
		await link(makeRequest({ organizationId: ORG, statementId: QUESTION }, alice));

		await expectHttpsError(
			link(makeRequest({ organizationId: ORG, statementId: QUESTION }, alice)),
			'already-exists',
		);
	});

	it('rejects a statement that is not a question', async () => {
		seedQuestion(QUESTION, { statementType: 'option' });

		await expectHttpsError(
			link(makeRequest({ organizationId: ORG, statementId: QUESTION }, alice)),
			'invalid-argument',
		);
	});

	it('rejects a missing question', async () => {
		await expectHttpsError(
			link(makeRequest({ organizationId: ORG, statementId: 'nope' }, alice)),
			'not-found',
		);
	});

	it('adds a survey by resolving it to the question it wraps', async () => {
		seedQuestion('q-wrapped');
		db.seed(Collections.surveys, 'survey_1712345678901_a1b2c3d', {
			surveyId: 'survey_1712345678901_a1b2c3d',
			title: 'Budget survey',
			creatorId: 'alice',
			questionIds: ['q-wrapped', 'q-extra'],
			createdAt: 1,
			lastUpdate: 1,
		});

		const { statementId } = await link(
			makeRequest(
				{ organizationId: ORG, surveyId: 'survey_1712345678901_a1b2c3d', label: 'Budget' },
				alice,
			),
		);

		expect(statementId).toBe('q-wrapped');
		expect(readActivity(ORG, 'q-wrapped').label).toBe('Budget');
	});

	it('rejects a survey that does not exist', async () => {
		await expectHttpsError(
			link(makeRequest({ organizationId: ORG, surveyId: 'survey_1_nope' }, alice)),
			'not-found',
		);
	});

	it('rejects a survey with no questions in it', async () => {
		db.seed(Collections.surveys, 'survey_1712345678901_empty0', {
			surveyId: 'survey_1712345678901_empty0',
			title: 'Empty',
			creatorId: 'alice',
			questionIds: [],
			createdAt: 1,
			lastUpdate: 1,
		});

		await expectHttpsError(
			link(makeRequest({ organizationId: ORG, surveyId: 'survey_1712345678901_empty0' }, alice)),
			'failed-precondition',
		);
	});

	it("still applies the eligibility rule to the survey's question", async () => {
		seedQuestion('q-outsider', { creatorId: 'carol' });
		db.seed(Collections.surveys, 'survey_1712345678901_out0000', {
			surveyId: 'survey_1712345678901_out0000',
			title: 'Outsider survey',
			creatorId: 'carol',
			questionIds: ['q-outsider'],
			createdAt: 1,
			lastUpdate: 1,
		});

		await expectHttpsError(
			link(makeRequest({ organizationId: ORG, surveyId: 'survey_1712345678901_out0000' }, alice)),
			'permission-denied',
		);
	});

	it('requires a statementId or a surveyId', async () => {
		await expectHttpsError(link(makeRequest({ organizationId: ORG }, alice)), 'invalid-argument');
	});

	it('lets the same question be linked by two organizations', async () => {
		seedQuestion();
		seedOrg(OTHER_ORG);
		seedMember('alice', OrganizationRole.owner, OTHER_ORG);

		await link(makeRequest({ organizationId: ORG, statementId: QUESTION }, alice));
		await link(makeRequest({ organizationId: OTHER_ORG, statementId: QUESTION }, alice));

		expect(readActivity(ORG)).toBeDefined();
		expect(readActivity(OTHER_ORG)).toBeDefined();
	});
});

describe('fn_renameOrgActivity', () => {
	beforeEach(async () => {
		seedQuestion();
		await link(makeRequest({ organizationId: ORG, statementId: QUESTION, label: 'First' }, alice));
	});

	it('changes the board name only', async () => {
		await rename(
			makeRequest({ organizationId: ORG, statementId: QUESTION, label: 'Second' }, alice),
		);

		expect(readActivity().label).toBe('Second');
		const statement = db.read(Collections.statements, QUESTION) as Record<string, unknown>;
		expect(statement.statement).toBe('The real title');
	});

	it('clears the board name when given an empty one', async () => {
		const { label } = await rename(
			makeRequest({ organizationId: ORG, statementId: QUESTION, label: '   ' }, alice),
		);

		expect(label).toBeNull();
		expect(readActivity().label).toBeUndefined();
	});

	it('rejects a question that is not on the board', async () => {
		await expectHttpsError(
			rename(makeRequest({ organizationId: ORG, statementId: 'nope', label: 'x' }, alice)),
			'not-found',
		);
	});
});

describe('fn_unlinkOrgStatement', () => {
	it('removes the link, the counter and the authority it granted', async () => {
		seedMember('carol', OrganizationRole.admin);
		seedQuestion(QUESTION, { creatorId: 'carol' });
		seedMember('bob', OrganizationRole.admin);
		seedSubscription('alice', QUESTION, Role.admin);
		await link(makeRequest({ organizationId: ORG, statementId: QUESTION }, alice));

		await unlink(makeRequest({ organizationId: ORG, statementId: QUESTION }, alice));

		expect(readActivity()).toBeUndefined();
		expect((db.read(Collections.organizations, ORG) as Record<string, unknown>).questionCount).toBe(
			0,
		);
		expect(readSubscription('bob')?.role).toBe(Role.member);
	});

	it('leaves an admin who already administered the question alone', async () => {
		seedMember('carol', OrganizationRole.admin);
		seedQuestion(QUESTION, { creatorId: 'carol' });
		seedMember('bob', OrganizationRole.admin);
		seedSubscription('bob', QUESTION, Role.creator);
		seedSubscription('alice', QUESTION, Role.admin);
		await link(makeRequest({ organizationId: ORG, statementId: QUESTION }, alice));

		await unlink(makeRequest({ organizationId: ORG, statementId: QUESTION }, alice));

		expect(readSubscription('bob')?.role).toBe(Role.creator);
	});

	it('leaves the question itself in place', async () => {
		seedQuestion();
		await link(makeRequest({ organizationId: ORG, statementId: QUESTION }, alice));
		const before = { ...(db.read(Collections.statements, QUESTION) as Record<string, unknown>) };

		await unlink(makeRequest({ organizationId: ORG, statementId: QUESTION }, alice));

		expect(db.read(Collections.statements, QUESTION)).toEqual(before);
	});

	it('rejects a question that is not on the board', async () => {
		await expectHttpsError(
			unlink(makeRequest({ organizationId: ORG, statementId: 'nope' }, alice)),
			'not-found',
		);
	});
});
