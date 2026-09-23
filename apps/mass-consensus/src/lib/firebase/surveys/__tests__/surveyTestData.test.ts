/**
 * Clear Test Data must also remove test-flagged evaluations and their
 * userEvaluations mirrors — otherwise participants still see every option
 * as "already evaluated" after the admin cleared the survey.
 */

interface FakeDoc {
  id: string;
  ref: { path: string };
}

type Filters = Record<string, unknown>;

const docsByCollection: Record<string, Array<{ id: string; data: Filters }>> = {};
const mockBatchDelete = jest.fn();
const mockBatchCommit = jest.fn().mockResolvedValue(undefined);

function makeQuery(collection: string, filters: Filters) {
  return {
    where: (field: string, _op: string, value: unknown) =>
      makeQuery(collection, { ...filters, [field]: value }),
    get: async () => {
      const docs: FakeDoc[] = (docsByCollection[collection] ?? [])
        .filter((d) => Object.entries(filters).every(([k, v]) => d.data[k] === v))
        .map((d) => ({ id: d.id, ref: { path: `${collection}/${d.id}` } }));

      return { docs, size: docs.length, empty: docs.length === 0 };
    },
  };
}

jest.mock('@/lib/firebase/admin', () => ({
  getFirestoreAdmin: () => ({
    collection: (name: string) => makeQuery(name, {}),
    batch: () => ({ delete: mockBatchDelete, commit: mockBatchCommit }),
  }),
}));

jest.mock('@/lib/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

jest.mock('../surveyCrud', () => ({
  getSurveyById: jest.fn().mockResolvedValue({
    surveyId: 's1',
    questionIds: ['q1', 'q2'],
  }),
}));

jest.mock('../surveyHelpers', () => ({
  SURVEY_PROGRESS_COLLECTION: 'surveyProgress',
  DEMOGRAPHIC_ANSWERS_COLLECTION: 'usersData',
  getStatementIdForSurvey: () => 's1',
}));

import { Collections } from '@freedi/shared-types';
import { clearSurveyTestData, getTestDataCounts } from '../surveyTestData';

function seed() {
  docsByCollection.surveyProgress = [
    { id: 'p-test', data: { surveyId: 's1', isTestData: true } },
    { id: 'p-live', data: { surveyId: 's1' } },
  ];
  docsByCollection.usersData = [];
  docsByCollection[Collections.evaluations] = [
    { id: 'e1', data: { parentId: 'q1', isTestData: true } },
    { id: 'e2', data: { parentId: 'q2', isTestData: true } },
    { id: 'e-live', data: { parentId: 'q1' } },
    { id: 'e-other', data: { parentId: 'other-q', isTestData: true } },
  ];
  docsByCollection[Collections.userEvaluations] = [
    { id: 'u1--q1', data: { parentStatementId: 'q1', isTestData: true } },
    { id: 'u2--q1', data: { parentStatementId: 'q1' } },
  ];
}

describe('surveyTestData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    seed();
  });

  it('counts test evaluations and userEvaluations of the survey questions', async () => {
    const counts = await getTestDataCounts('s1');

    expect(counts).toEqual({
      progressCount: 1,
      demographicAnswerCount: 0,
      evaluationCount: 2,
      userEvaluationCount: 1,
      total: 4,
    });
  });

  it('deletes only test-flagged docs, including evaluations and their mirrors', async () => {
    const result = await clearSurveyTestData('s1');

    expect(result.success).toBe(true);
    expect(result.deletedCounts.total).toBe(4);

    const deletedPaths = mockBatchDelete.mock.calls.map(([ref]) => ref.path).sort();
    expect(deletedPaths).toEqual(
      [
        'surveyProgress/p-test',
        `${Collections.evaluations}/e1`,
        `${Collections.evaluations}/e2`,
        `${Collections.userEvaluations}/u1--q1`,
      ].sort()
    );
  });
});
