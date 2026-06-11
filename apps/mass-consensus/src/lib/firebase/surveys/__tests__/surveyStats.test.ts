/**
 * Survey Stats Tests - entry tracking semantics
 * Entry-only progress docs (created when a user merely lands on the survey)
 * must count as "entered" but not as "responses", so completion rates and
 * the admin funnel are not diluted by bounced visitors.
 */

const mockGet = jest.fn();
const mockWhere = jest.fn().mockReturnValue({ get: mockGet });
const mockCollection = jest.fn().mockReturnValue({ where: mockWhere });

jest.mock('@/lib/firebase/admin', () => ({
  getFirestoreAdmin: () => ({
    collection: mockCollection,
  }),
}));

jest.mock('@/lib/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

import { getSurveyStats } from '../surveyStats';

interface ProgressDocData {
  surveyId: string;
  userId: string;
  currentQuestionIndex?: number;
  completedQuestionIds?: string[];
  isCompleted?: boolean;
  isTestData?: boolean;
  hasViewedOpeningSlide?: boolean;
  enteredAt?: number;
}

function makeDoc(data: ProgressDocData) {
  return { data: () => data };
}

function mockProgressDocs(docs: ProgressDocData[]) {
  mockGet.mockResolvedValue({ docs: docs.map(makeDoc) });
}

describe('getSurveyStats - entry tracking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('counts entry-only docs as entered but not as responses', async () => {
    mockProgressDocs([
      // Entry-only (bounced): landed via /enter, never advanced
      { surveyId: 's1', userId: 'u1', currentQuestionIndex: 0, completedQuestionIds: [], enteredAt: 1 },
      // Engaged: completed a question
      { surveyId: 's1', userId: 'u2', completedQuestionIds: ['q1'] },
      // Engaged + completed
      { surveyId: 's1', userId: 'u3', completedQuestionIds: ['q1'], isCompleted: true },
    ]);

    const stats = await getSurveyStats('s1');

    expect(stats.enteredCount).toBe(3);
    expect(stats.responseCount).toBe(2);
    expect(stats.completionCount).toBe(1);
    expect(stats.completionRate).toBe(50);
  });

  it('treats opening-slide viewers and flow progress as responses', async () => {
    mockProgressDocs([
      { surveyId: 's1', userId: 'u1', hasViewedOpeningSlide: true },
      { surveyId: 's1', userId: 'u2', currentQuestionIndex: 2 },
    ]);

    const stats = await getSurveyStats('s1');

    expect(stats.responseCount).toBe(2);
  });

  it('excludes test data unless requested', async () => {
    mockProgressDocs([
      { surveyId: 's1', userId: 'u1', completedQuestionIds: ['q1'], isTestData: true, isCompleted: true },
      { surveyId: 's1', userId: 'u2', completedQuestionIds: ['q1'] },
      { surveyId: 's1', userId: 'u3', enteredAt: 1, isTestData: true },
    ]);

    const liveStats = await getSurveyStats('s1');
    expect(liveStats.enteredCount).toBe(1);
    expect(liveStats.responseCount).toBe(1);
    expect(liveStats.completionCount).toBe(0);

    const allStats = await getSurveyStats('s1', { includeTestData: true });
    expect(allStats.enteredCount).toBe(3);
    expect(allStats.responseCount).toBe(2);
    expect(allStats.completionCount).toBe(1);
  });
});
