import {
	Collections,
	OrganizationRole,
	Role,
	StatementType,
	SurveyAdminRole,
	calcAgreementIndex,
	getOrganizationMemberId,
	getSurveyAdminId,
} from '@freedi/shared-types';
import { createFakeDb, FakeDb } from '../progress/__tests__/fakeDb';

let fake: FakeDb = createFakeDb();

jest.mock('../db', () => ({
	get db() {
		return fake.db;
	},
}));

class FakeHttpsError extends Error {
	code: string;
	constructor(code: string, message: string) {
		super(message);
		this.code = code;
	}
}
jest.mock('firebase-functions/v2/https', () => ({
	onCall: jest.fn((_opts: unknown, handler: unknown) => handler),
	HttpsError: FakeHttpsError,
}));

jest.mock('../utils/errorHandling', () => ({
	logError: jest.fn(),
}));

import { recalculateIndices } from '../fn_recalculateIndices';

interface CallResult {
	success: boolean;
	optionsUpdated: number;
	targetPopulation: number | undefined;
}

// jest.mock above turns onCall into the identity, so the export is the handler.
const call = recalculateIndices as unknown as (request: {
	auth?: { uid: string };
	data: { statementId?: unknown };
}) => Promise<CallResult>;

const QUESTION = 'question-1';
const OPTION = 'option-1';
const HOME = 'jcClass_class-1';
const LESSON = 'lesson-1';
const ORG = 'org-1';
const SURVEY = 'survey-1';
const CREATOR = 'creator-uid';
const CALLER = 'caller-uid';
const POPULATION = 100;
const EVALUATORS = 4;
const SUM = 2;
const SUM_SQUARED = 2;

function seedQuestion(overrides: Record<string, unknown> = {}): void {
	fake.seed(Collections.statements, QUESTION, {
		statementId: QUESTION,
		statement: 'What should we do?',
		statementType: StatementType.question,
		parentId: 'top',
		topParentId: QUESTION,
		creatorId: CREATOR,
		evaluationSettings: { targetPopulation: POPULATION },
		...overrides,
	});
	fake.seed(Collections.statements, OPTION, {
		statementId: OPTION,
		statement: 'An idea',
		statementType: StatementType.option,
		parentId: QUESTION,
		topParentId: overrides.topParentId ?? QUESTION,
		creatorId: 'someone-else',
		evaluation: {
			sumEvaluations: SUM,
			sumSquaredEvaluations: SUM_SQUARED,
			numberOfEvaluators: EVALUATORS,
		},
	});
}

/** A Class question: home (top) > lesson > question, as lessons sit since the homes. */
function seedClassQuestion(): void {
	seedQuestion({ parentId: LESSON, topParentId: HOME, parents: [HOME, LESSON] });
	fake.seed(Collections.statements, HOME, {
		statementId: HOME,
		parentId: 'top',
		topParentId: HOME,
		creatorId: CREATOR,
	});
	fake.seed(Collections.statements, LESSON, {
		statementId: LESSON,
		parentId: HOME,
		topParentId: HOME,
		creatorId: CREATOR,
	});
}

function seedSubscription(statementId: string, role: Role, uid: string = CALLER): void {
	fake.seed(Collections.statementsSubscribe, `${uid}--${statementId}`, {
		role,
		userId: uid,
		statementId,
	});
}

const asCaller = (uid: string = CALLER) => ({ auth: { uid }, data: { statementId: QUESTION } });

function optionWasRescored(): boolean {
	const evaluation = fake.read(Collections.statements, OPTION)?.evaluation as
		| { agreementIndex?: number; stakeholderCount?: number }
		| undefined;

	return (
		evaluation?.stakeholderCount === POPULATION &&
		evaluation?.agreementIndex === calcAgreementIndex(SUM, SUM_SQUARED, EVALUATORS, POPULATION)
	);
}

async function expectAllowed(uid: string = CALLER): Promise<void> {
	const result = await call(asCaller(uid));

	expect(result).toMatchObject({
		success: true,
		optionsUpdated: 1,
		targetPopulation: POPULATION,
	});
	expect(optionWasRescored()).toBe(true);
}

async function expectRefused(uid: string = CALLER): Promise<void> {
	await expect(call(asCaller(uid))).rejects.toMatchObject({ code: 'permission-denied' });
	expect(fake.read(Collections.statements, OPTION)?.consensus).toBeUndefined();
	expect(optionWasRescored()).toBe(false);
}

beforeEach(() => {
	fake = createFakeDb();
});

describe('recalculateIndices authorization', () => {
	describe('refused before touching any data', () => {
		beforeEach(() => seedQuestion());

		it('refuses an unauthenticated caller', async () => {
			await expect(call({ data: { statementId: QUESTION } })).rejects.toMatchObject({
				code: 'unauthenticated',
			});
			expect(optionWasRescored()).toBe(false);
		});

		it('answers unauthenticated even when the id is missing', async () => {
			await expect(call({ data: {} })).rejects.toMatchObject({ code: 'unauthenticated' });
		});

		it.each([[undefined], [''], [42], [{ path: QUESTION }]])(
			'refuses a statementId of %p',
			async (statementId) => {
				await expect(call({ auth: { uid: CREATOR }, data: { statementId } })).rejects.toMatchObject(
					{ code: 'invalid-argument' },
				);
			},
		);

		it('answers not-found for a question that does not exist', async () => {
			await expect(
				call({ auth: { uid: CREATOR }, data: { statementId: 'no-such-question' } }),
			).rejects.toMatchObject({ code: 'not-found' });
		});
	});

	describe('allowed', () => {
		it('lets the creator recalculate, with no subscription at all', async () => {
			seedQuestion();

			await expectAllowed(CREATOR);
		});

		it('lets an admin of the question recalculate', async () => {
			seedQuestion();
			seedSubscription(QUESTION, Role.admin);

			await expectAllowed();
		});

		it('lets a statement-creator role recalculate', async () => {
			seedQuestion();
			seedSubscription(QUESTION, Role.creator);

			await expectAllowed();
		});

		it('lets an admin of the top statement recalculate without a copy on the question', async () => {
			seedQuestion({ parentId: 'group-1', topParentId: 'group-1' });
			seedSubscription('group-1', Role.admin);

			await expectAllowed();
		});

		it('lets an owner or admin of the organization that holds the question recalculate', async () => {
			seedQuestion({ organizationId: ORG });
			fake.seed(Collections.organizationMembers, getOrganizationMemberId(ORG, CALLER), {
				role: OrganizationRole.admin,
			});

			await expectAllowed();
		});
	});

	describe('Class lessons', () => {
		it('lets the teacher who started the lesson recalculate', async () => {
			seedClassQuestion();

			await expectAllowed(CREATOR);
		});

		it('lets a teacher with an admin copy on the question recalculate', async () => {
			seedClassQuestion();
			seedSubscription(QUESTION, Role.admin);

			await expectAllowed();
		});

		it('lets a teacher who is admin of the home recalculate, with no copy on the question', async () => {
			seedClassQuestion();
			seedSubscription(HOME, Role.admin);

			await expectAllowed();
		});

		it('lets a teacher recalculate on an old lesson, which is its own top statement', async () => {
			seedQuestion({ parentId: LESSON, topParentId: LESSON, parents: [LESSON] });
			seedSubscription(LESSON, Role.admin);

			await expectAllowed();
		});

		it('refuses a student, who is a member of the lesson and of the question', async () => {
			seedClassQuestion();
			seedSubscription(HOME, Role.member);
			seedSubscription(LESSON, Role.member);
			seedSubscription(QUESTION, Role.member);

			await expectRefused();
		});

		// The shared check reads the question and its top statement, never the
		// statements in between, so holding the lesson alone is not enough. Teachers
		// are covered by the home subscription and their copies; this pins the edge.
		it('refuses an admin of the lesson alone, under a home', async () => {
			seedClassQuestion();
			seedSubscription(LESSON, Role.admin);

			await expectRefused();
		});
	});

	describe('refused', () => {
		beforeEach(() => seedQuestion());

		it('refuses a caller with no relation to the question', async () => {
			await expectRefused();
		});

		it('refuses a plain member', async () => {
			seedSubscription(QUESTION, Role.member);

			await expectRefused();
		});

		it('refuses a banned subscriber', async () => {
			seedSubscription(QUESTION, Role.banned);

			await expectRefused();
		});

		it('refuses an admin of a different statement', async () => {
			seedSubscription('another-question', Role.admin);

			await expectRefused();
		});

		it('refuses a viewer of the organization', async () => {
			seedQuestion({ organizationId: ORG });
			fake.seed(Collections.organizationMembers, getOrganizationMemberId(ORG, CALLER), {
				role: OrganizationRole.viewer,
			});

			await expectRefused();
		});
	});

	// MC co-admins are recorded in `surveyAdmins`, and nothing copies them onto the
	// survey's questions. These pin today's answer: passing them needs a decision,
	// and the day it is made these tests are the ones that should change.
	describe('MC survey admins, who hold no statement subscription', () => {
		beforeEach(() => {
			seedQuestion();
			fake.seed(Collections.surveys, SURVEY, {
				surveyId: SURVEY,
				creatorId: 'survey-owner',
				questionIds: [QUESTION],
			});
		});

		it('refuses an editor co-admin of a survey holding the question', async () => {
			fake.seed(Collections.surveyAdmins, getSurveyAdminId(SURVEY, CALLER), {
				surveyId: SURVEY,
				userId: CALLER,
				role: SurveyAdminRole.editor,
			});

			await expectRefused();
		});

		it('refuses the owner of a survey holding a question someone else created', async () => {
			await expectRefused('survey-owner');
		});

		it('lets a co-admin recalculate a question they created themselves', async () => {
			fake.seed(Collections.surveyAdmins, getSurveyAdminId(SURVEY, CREATOR), {
				surveyId: SURVEY,
				userId: CREATOR,
				role: SurveyAdminRole.editor,
			});

			await expectAllowed(CREATOR);
		});
	});
});
