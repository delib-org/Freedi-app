import {
	Collections,
	OrganizationRole,
	Role,
	StatementType,
	SurveyAdminRole,
	calcAgreementIndex,
	calcConfidenceIndex,
	DEFAULT_SAMPLING_QUALITY,
	getOrganizationMemberId,
	getSurveyAdminId,
} from '@freedi/shared-types';
import { createFakeDb, FakeDb } from '../progress/__tests__/fakeDb';
import { BATCH_WRITE_LIMIT } from '../classroom/batchedWrites';
import { clearChainCache } from '../progress/chainVoters';

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
	optionsUnchanged: number;
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
	clearChainCache();
});

/** Records the size of every committed batch; `failOnCommit` (0-based) makes one throw. */
function watchBatches(failOnCommit?: number): number[] {
	const sizes: number[] = [];
	const realBatch = fake.db.batch;
	let commits = 0;
	fake.db.batch = () => {
		const batch = realBatch();
		let size = 0;

		return {
			set: (...args: Parameters<typeof batch.set>) => {
				size++;
				batch.set(...args);
			},
			update: (...args: Parameters<typeof batch.update>) => {
				size++;
				batch.update(...args);
			},
			commit: async () => {
				if (commits++ === failOnCommit) throw new Error('commit failed');
				sizes.push(size);
				await batch.commit();
			},
		};
	};

	return sizes;
}

function seedManyOptions(count: number): void {
	for (let i = 0; i < count; i++) {
		const id = `many-${String(i).padStart(5, '0')}`;
		fake.seed(Collections.statements, id, {
			statementId: id,
			statementType: StatementType.option,
			parentId: QUESTION,
			topParentId: QUESTION,
			evaluation: {
				sumEvaluations: SUM,
				sumSquaredEvaluations: SUM_SQUARED,
				numberOfEvaluators: EVALUATORS,
			},
		});
	}
}

const isRescored = (id: string): boolean =>
	(fake.read(Collections.statements, id)?.evaluation as { stakeholderCount?: number })
		.stakeholderCount === POPULATION;

const optionEvaluation = (): Record<string, unknown> =>
	fake.read(Collections.statements, OPTION)?.evaluation as Record<string, unknown>;

describe('recalculateIndices writes', () => {
	describe('size', () => {
		it('splits a question larger than one batch, and rescores every option', async () => {
			seedQuestion();
			fake.store.get(Collections.statements)?.delete(OPTION);
			const optionCount = BATCH_WRITE_LIMIT * 2 + 1;
			seedManyOptions(optionCount);
			const sizes = watchBatches();

			const result = await call(asCaller(CREATOR));

			// The first batch is the question's own participation stat.
			expect(sizes.slice(1)).toEqual([BATCH_WRITE_LIMIT, BATCH_WRITE_LIMIT, 1]);
			expect(result.optionsUpdated).toBe(optionCount);
			expect(isRescored('many-00000')).toBe(true);
			expect(isRescored(`many-${String(optionCount - 1).padStart(5, '0')}`)).toBe(true);
		});

		it('reports a failure part way, and a second call finishes only what is left', async () => {
			seedQuestion();
			fake.store.get(Collections.statements)?.delete(OPTION);
			const optionCount = BATCH_WRITE_LIMIT + 1;
			seedManyOptions(optionCount);
			const lastOption = `many-${String(optionCount - 1).padStart(5, '0')}`;
			// Commit 0 is the participation stat, 1 the first options, 2 the rest.
			watchBatches(2);

			await expect(call(asCaller(CREATOR))).rejects.toMatchObject({ code: 'internal' });
			expect(isRescored('many-00000')).toBe(true);
			expect(isRescored(lastOption)).toBe(false);

			const sizes = watchBatches();
			const retry = await call(asCaller(CREATOR));

			expect(sizes).toEqual([1]);
			expect(retry).toMatchObject({ optionsUpdated: 1, optionsUnchanged: BATCH_WRITE_LIMIT });
			expect(isRescored(lastOption)).toBe(true);
		});
	});

	describe('skipping what would not change', () => {
		it('writes nothing at all on a repeat call', async () => {
			seedQuestion();
			await call(asCaller(CREATOR));
			const optionLastUpdate = 1;
			const questionLastUpdate = 2;
			fake.seed(Collections.statements, OPTION, {
				...fake.read(Collections.statements, OPTION),
				lastUpdate: optionLastUpdate,
			});
			fake.seed(Collections.statements, QUESTION, {
				...fake.read(Collections.statements, QUESTION),
				lastUpdate: questionLastUpdate,
			});
			const progressBefore = fake.read(Collections.questionProgress, QUESTION);
			const sizes = watchBatches();

			const result = await call(asCaller(CREATOR));

			expect(sizes).toEqual([]);
			expect(result).toMatchObject({ optionsUpdated: 0, optionsUnchanged: 1 });
			expect(fake.read(Collections.statements, OPTION)?.lastUpdate).toBe(optionLastUpdate);
			expect(fake.read(Collections.statements, QUESTION)?.lastUpdate).toBe(questionLastUpdate);
			expect(fake.read(Collections.questionProgress, QUESTION)).toEqual(progressBefore);
		});

		it('writes when only N changed, with the new count and confidence', async () => {
			seedQuestion();
			await call(asCaller(CREATOR));
			const newPopulation = POPULATION * 2;
			fake.seed(Collections.statements, QUESTION, {
				...fake.read(Collections.statements, QUESTION),
				evaluationSettings: { targetPopulation: newPopulation },
			});
			const sizes = watchBatches();

			const result = await call(asCaller(CREATOR));

			expect(sizes).toEqual([1]);
			expect(result).toMatchObject({ optionsUpdated: 1, targetPopulation: newPopulation });
			expect(optionEvaluation().stakeholderCount).toBe(newPopulation);
			expect(optionEvaluation().confidenceIndex).toBe(
				calcConfidenceIndex(EVALUATORS, newPopulation, DEFAULT_SAMPLING_QUALITY),
			);
		});

		it.each([
			['consensus'],
			['consensusValid'],
			['evaluation.agreement'],
			['evaluation.agreementIndex'],
			['evaluation.likeMindedness'],
			['evaluation.stakeholderCount'],
			['evaluation.confidenceIndex'],
		])('rewrites an option when only %s has drifted', async (path) => {
			seedQuestion();
			await call(asCaller(CREATOR));
			const stored = fake.read(Collections.statements, OPTION) as Record<string, unknown>;
			const correct = path.startsWith('evaluation.')
				? optionEvaluation()[path.replace('evaluation.', '')]
				: stored[path];
			const drifted = -1;
			fake.seed(Collections.statements, OPTION, {
				...stored,
				...(path.startsWith('evaluation.')
					? {
							evaluation: { ...optionEvaluation(), [path.replace('evaluation.', '')]: drifted },
						}
					: { [path]: drifted }),
			});

			const result = await call(asCaller(CREATOR));

			expect(result.optionsUpdated).toBe(1);
			const after = fake.read(Collections.statements, OPTION) as Record<string, unknown>;
			expect(
				path.startsWith('evaluation.')
					? optionEvaluation()[path.replace('evaluation.', '')]
					: after[path],
			).toBe(correct);
		});

		it('deletes both the count and the confidence when N is removed, then stays quiet', async () => {
			seedQuestion();
			await call(asCaller(CREATOR));
			expect(optionEvaluation().confidenceIndex).toEqual(expect.any(Number));
			fake.seed(Collections.statements, QUESTION, {
				...fake.read(Collections.statements, QUESTION),
				evaluationSettings: {},
			});

			const removed = await call(asCaller(CREATOR));

			expect(removed).toMatchObject({ optionsUpdated: 1 });
			expect(optionEvaluation()).not.toHaveProperty('stakeholderCount');
			expect(optionEvaluation()).not.toHaveProperty('confidenceIndex');

			const sizes = watchBatches();
			const repeat = await call(asCaller(CREATOR));

			expect(sizes).toEqual([]);
			expect(repeat).toMatchObject({ optionsUpdated: 0, optionsUnchanged: 1 });
		});

		it('writes only the options that changed, and moves only their lastUpdate', async () => {
			seedQuestion();
			await call(asCaller(CREATOR));
			const untouchedLastUpdate = 1;
			fake.seed(Collections.statements, OPTION, {
				...fake.read(Collections.statements, OPTION),
				lastUpdate: untouchedLastUpdate,
			});
			seedManyOptions(1);

			const result = await call(asCaller(CREATOR));

			expect(result).toMatchObject({ optionsUpdated: 1, optionsUnchanged: 1 });
			expect(fake.read(Collections.statements, OPTION)?.lastUpdate).toBe(untouchedLastUpdate);
			expect(isRescored('many-00000')).toBe(true);
		});
	});
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
	// survey's questions. The fixture: a co-admin (CREATOR) wrote the question, and
	// the survey is owned by someone else.
	describe('MC survey admins, who hold no statement subscription', () => {
		const OWNER = 'survey-owner';
		const OTHER_SURVEY = 'survey-2';

		function seedSurveyAdmin(surveyId: string, uid: string, role: SurveyAdminRole): void {
			fake.seed(Collections.surveyAdmins, getSurveyAdminId(surveyId, uid), {
				surveyId,
				userId: uid,
				role,
			});
		}

		const inSurvey = (surveyId: unknown, uid: string = CALLER) => ({
			auth: { uid },
			data: { statementId: QUESTION, surveyId },
		});

		async function expectRefusedInSurvey(surveyId: unknown, uid: string = CALLER): Promise<void> {
			await expect(call(inSurvey(surveyId, uid))).rejects.toMatchObject({
				code: 'permission-denied',
				message: 'You are not authorized for this statement',
			});
			expect(optionWasRescored()).toBe(false);
		}

		beforeEach(() => {
			seedQuestion();
			fake.seed(Collections.surveys, SURVEY, {
				surveyId: SURVEY,
				creatorId: OWNER,
				questionIds: [QUESTION],
			});
			seedSurveyAdmin(SURVEY, CREATOR, SurveyAdminRole.editor);
		});

		describe('allowed with the surveyId', () => {
			it('lets an editor co-admin recalculate', async () => {
				seedSurveyAdmin(SURVEY, CALLER, SurveyAdminRole.editor);

				const result = await call(inSurvey(SURVEY));

				expect(result.optionsUpdated).toBe(1);
				expect(optionWasRescored()).toBe(true);
			});

			it('lets the survey owner recalculate a question someone else created', async () => {
				const result = await call(inSurvey(SURVEY, OWNER));

				expect(result.optionsUpdated).toBe(1);
				expect(optionWasRescored()).toBe(true);
			});

			it('lets a co-admin recalculate a question they created, needing no surveyId', async () => {
				await expectAllowed(CREATOR);
			});

			it('still lets a statement admin through when the surveyId means nothing', async () => {
				seedSubscription(QUESTION, Role.admin);

				const result = await call(inSurvey('no-such-survey'));

				expect(result.optionsUpdated).toBe(1);
			});
		});

		describe('refused', () => {
			it('refuses an editor co-admin who sends no surveyId', async () => {
				seedSurveyAdmin(SURVEY, CALLER, SurveyAdminRole.editor);

				await expectRefused();
			});

			it('refuses the survey owner who sends no surveyId', async () => {
				await expectRefused(OWNER);
			});

			it('refuses a viewer co-admin', async () => {
				seedSurveyAdmin(SURVEY, CALLER, SurveyAdminRole.viewer);

				await expectRefusedInSurvey(SURVEY);
			});

			it('refuses a caller on no roster', async () => {
				await expectRefusedInSurvey(SURVEY);
			});

			it('refuses a survey that does not exist, with the same answer', async () => {
				seedSurveyAdmin('no-such-survey', CALLER, SurveyAdminRole.editor);

				await expectRefusedInSurvey('no-such-survey');
			});

			it('refuses a survey that does not contain the question', async () => {
				fake.seed(Collections.surveys, SURVEY, {
					surveyId: SURVEY,
					creatorId: OWNER,
					questionIds: ['another-question'],
				});
				seedSurveyAdmin(SURVEY, CALLER, SurveyAdminRole.editor);

				await expectRefusedInSurvey(SURVEY);
			});

			it('refuses the id of another survey the caller edits, which lacks the question', async () => {
				fake.seed(Collections.surveys, OTHER_SURVEY, {
					surveyId: OTHER_SURVEY,
					creatorId: CALLER,
					questionIds: ['another-question'],
				});
				seedSurveyAdmin(OTHER_SURVEY, CALLER, SurveyAdminRole.editor);

				await expectRefusedInSurvey(OTHER_SURVEY);
			});

			it('refuses an editor of another survey naming the survey that has the question', async () => {
				seedSurveyAdmin(OTHER_SURVEY, CALLER, SurveyAdminRole.editor);

				await expectRefusedInSurvey(SURVEY);
			});

			it('refuses a roster record that names someone else', async () => {
				fake.seed(Collections.surveyAdmins, getSurveyAdminId(SURVEY, CALLER), {
					surveyId: SURVEY,
					userId: 'someone-else',
					role: SurveyAdminRole.editor,
				});

				await expectRefusedInSurvey(SURVEY);
			});

			it('refuses a survey with malformed questionIds', async () => {
				fake.seed(Collections.surveys, SURVEY, { surveyId: SURVEY, creatorId: CALLER });

				await expectRefusedInSurvey(SURVEY);
			});
		});

		it.each([[''], [42], [null], [{ id: SURVEY }], ['surveys/survey-1']])(
			'answers invalid-argument for a surveyId of %p',
			async (surveyId) => {
				seedSurveyAdmin(SURVEY, CALLER, SurveyAdminRole.editor);

				await expect(call(inSurvey(surveyId))).rejects.toMatchObject({
					code: 'invalid-argument',
				});
				expect(optionWasRescored()).toBe(false);
			},
		);
	});
});
