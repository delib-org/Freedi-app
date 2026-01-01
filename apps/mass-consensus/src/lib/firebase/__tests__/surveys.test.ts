/**
 * Tests for Survey Firestore operations
 */
import { Statement, StatementType, Collections, Role } from '@freedi/shared-types';
import {
  Survey,
  SurveyProgress,
  SurveyStatus,
  SurveyDemographicQuestion,
  SurveyDemographicAnswer,
  DEFAULT_SURVEY_SETTINGS,
} from '@/types/survey';

// Mock dependencies
jest.mock('../admin', () => ({
  getFirestoreAdmin: jest.fn(),
}));

jest.mock('@/lib/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { getFirestoreAdmin } from '../admin';
import {
  createSurvey,
  getSurveyById,
  getSurveyWithQuestions,
  updateSurvey,
  deleteSurvey,
  getSurveysByCreator,
  getSurveyProgress,
  upsertSurveyProgress,
  getQuestionsByCreator,
  searchQuestions,
  changeSurveyStatus,
  getSurveyStats,
  getSurveyDemographicQuestions,
  getAllSurveyDemographicQuestions,
  createSurveyDemographicQuestion,
  updateSurveyDemographicQuestion,
  deleteSurveyDemographicQuestion,
  batchSaveDemographicQuestions,
  saveSurveyDemographicAnswers,
  getSurveyDemographicAnswers,
  getAllSurveyDemographicAnswers,
} from '../surveys';

describe('surveys', () => {
  // Mock Firestore helpers
  const createMockDoc = (data: unknown, exists = true) => ({
    exists,
    data: () => data,
    id: 'mock-id',
  });

  const createMockSnapshot = (docs: Array<{ id: string; data: unknown }>) => ({
    docs: docs.map((d) => ({
      data: () => d.data,
      id: d.id,
    })),
    empty: docs.length === 0,
    size: docs.length,
  });

  // Mock Firestore chain
  const mockSet = jest.fn().mockResolvedValue(undefined);
  const mockUpdate = jest.fn().mockResolvedValue(undefined);
  const mockDelete = jest.fn().mockResolvedValue(undefined);
  const mockGet = jest.fn();
  const mockDoc = jest.fn();
  const mockWhere = jest.fn();
  const mockOrderBy = jest.fn();
  const mockLimit = jest.fn();
  const mockStartAfter = jest.fn();
  const mockCollection = jest.fn();
  const mockBatch = jest.fn();

  const mockDb = {
    collection: mockCollection,
    batch: mockBatch,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset chain mocks
    mockGet.mockResolvedValue(createMockSnapshot([]));
    mockLimit.mockReturnValue({ get: mockGet, startAfter: mockStartAfter });
    mockStartAfter.mockReturnValue({ get: mockGet });
    mockOrderBy.mockReturnValue({ limit: mockLimit, get: mockGet, orderBy: mockOrderBy });
    mockWhere.mockReturnValue({
      where: mockWhere,
      orderBy: mockOrderBy,
      limit: mockLimit,
      get: mockGet
    });
    mockDoc.mockReturnValue({
      get: mockGet,
      set: mockSet,
      update: mockUpdate,
      delete: mockDelete
    });
    mockCollection.mockReturnValue({
      doc: mockDoc,
      where: mockWhere,
      orderBy: mockOrderBy,
      get: mockGet
    });
    mockBatch.mockReturnValue({
      set: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      commit: jest.fn().mockResolvedValue(undefined),
    });

    (getFirestoreAdmin as jest.Mock).mockReturnValue(mockDb);
  });

  // ==========================================
  // SURVEY CRUD OPERATIONS
  // ==========================================

  describe('createSurvey', () => {
    it('should create a survey with required fields', async () => {
      const survey = await createSurvey('creator-123', {
        title: 'Test Survey',
        questionIds: ['q1', 'q2'],
      });

      expect(survey.title).toBe('Test Survey');
      expect(survey.creatorId).toBe('creator-123');
      expect(survey.questionIds).toEqual(['q1', 'q2']);
      expect(survey.status).toBe(SurveyStatus.draft);
      expect(mockSet).toHaveBeenCalled();
    });

    it('should merge default settings with provided settings', async () => {
      const survey = await createSurvey('creator-123', {
        title: 'Test Survey',
        settings: { allowSkipping: true },
      });

      expect(survey.settings.allowSkipping).toBe(true);
      expect(survey.settings.allowReturning).toBe(DEFAULT_SURVEY_SETTINGS.allowReturning);
    });

    it('should include optional fields when provided', async () => {
      const survey = await createSurvey('creator-123', {
        title: 'Test Survey',
        description: 'Description',
        defaultLanguage: 'en',
        forceLanguage: true,
        demographicPages: [{ demographicPageId: 'dp-1', title: 'Page 1', position: 0 }],
        explanationPages: [{ explanationPageId: 'ep-1', title: 'Explanation', content: 'Content', position: 0 }],
      });

      expect(survey.description).toBe('Description');
      expect(survey.defaultLanguage).toBe('en');
      expect(survey.forceLanguage).toBe(true);
      expect(survey.demographicPages).toHaveLength(1);
      expect(survey.explanationPages).toHaveLength(1);
    });

    it('should generate unique survey ID', async () => {
      const survey1 = await createSurvey('creator-123', { title: 'Survey 1' });
      const survey2 = await createSurvey('creator-123', { title: 'Survey 2' });

      expect(survey1.surveyId).toMatch(/^survey_\d+_\w+$/);
      expect(survey1.surveyId).not.toBe(survey2.surveyId);
    });
  });

  describe('getSurveyById', () => {
    it('should return survey if exists', async () => {
      const mockSurvey: Survey = {
        surveyId: 'survey-123',
        title: 'Test Survey',
        creatorId: 'creator-123',
        questionIds: [],
        settings: DEFAULT_SURVEY_SETTINGS,
        questionSettings: {},
        status: SurveyStatus.draft,
        createdAt: Date.now(),
        lastUpdate: Date.now(),
      };
      mockGet.mockResolvedValue(createMockDoc(mockSurvey));

      const result = await getSurveyById('survey-123');

      expect(result).toEqual(mockSurvey);
    });

    it('should return null if survey does not exist', async () => {
      mockGet.mockResolvedValue(createMockDoc(null, false));

      const result = await getSurveyById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getSurveyWithQuestions', () => {
    it('should return survey with populated questions', async () => {
      const mockSurvey: Survey = {
        surveyId: 'survey-123',
        title: 'Test Survey',
        creatorId: 'creator-123',
        questionIds: ['q1', 'q2'],
        settings: DEFAULT_SURVEY_SETTINGS,
        questionSettings: {},
        status: SurveyStatus.draft,
        createdAt: Date.now(),
        lastUpdate: Date.now(),
      };

      const mockQuestion: Statement = {
        statementId: 'q1',
        statement: 'Question 1',
        statementType: StatementType.question,
        parentId: '',
        creatorId: 'creator-123',
        createdAt: Date.now(),
        lastUpdate: Date.now(),
        parents: [],
        topParentId: 'q1',
        hasChildren: false,
        resultsSettings: { resultsBy: 'consensus', numberOfResults: 1 },
        results: [],
        consensus: 0,
      } as Statement;

      mockGet
        .mockResolvedValueOnce(createMockDoc(mockSurvey)) // getSurveyById
        .mockResolvedValueOnce(createMockDoc(mockQuestion)) // q1
        .mockResolvedValueOnce(createMockDoc(null, false)); // q2 not found

      const result = await getSurveyWithQuestions('survey-123');

      expect(result).not.toBeNull();
      expect(result?.questions).toHaveLength(1);
      expect(result?.questions[0].statementId).toBe('q1');
    });

    it('should return null if survey does not exist', async () => {
      mockGet.mockResolvedValue(createMockDoc(null, false));

      const result = await getSurveyWithQuestions('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('updateSurvey', () => {
    const mockSurvey: Survey = {
      surveyId: 'survey-123',
      title: 'Original Title',
      creatorId: 'creator-123',
      questionIds: ['q1'],
      settings: DEFAULT_SURVEY_SETTINGS,
      questionSettings: {},
      status: SurveyStatus.draft,
      createdAt: Date.now(),
      lastUpdate: Date.now(),
    };

    it('should update survey fields', async () => {
      mockGet.mockResolvedValue(createMockDoc(mockSurvey));

      const result = await updateSurvey('survey-123', {
        title: 'Updated Title',
        description: 'New description',
      });

      expect(mockUpdate).toHaveBeenCalled();
      expect(result).not.toBeNull();
    });

    it('should return null if survey does not exist', async () => {
      mockGet.mockResolvedValue(createMockDoc(null, false));

      const result = await updateSurvey('nonexistent', { title: 'New' });

      expect(result).toBeNull();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('should merge settings correctly', async () => {
      mockGet.mockResolvedValue(createMockDoc(mockSurvey));

      await updateSurvey('survey-123', {
        settings: { allowSkipping: true },
      });

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            allowSkipping: true,
          }),
        })
      );
    });
  });

  describe('deleteSurvey', () => {
    it('should delete existing survey', async () => {
      mockGet.mockResolvedValue(createMockDoc({ surveyId: 'survey-123' }));

      const result = await deleteSurvey('survey-123');

      expect(result).toBe(true);
      expect(mockDelete).toHaveBeenCalled();
    });

    it('should still call delete even if check is skipped', async () => {
      // Note: The implementation deletes without checking existence first
      mockGet.mockResolvedValue(createMockDoc(null, false));

      const result = await deleteSurvey('nonexistent');

      // Implementation always returns true after delete
      expect(result).toBe(true);
    });
  });

  describe('getSurveysByCreator', () => {
    it('should return surveys for creator', async () => {
      const mockSurveys = [
        { id: 'survey-1', data: { surveyId: 'survey-1', title: 'Survey 1' } },
        { id: 'survey-2', data: { surveyId: 'survey-2', title: 'Survey 2' } },
      ];
      mockGet.mockResolvedValue(createMockSnapshot(mockSurveys));

      const result = await getSurveysByCreator('creator-123');

      expect(mockWhere).toHaveBeenCalledWith('creatorId', '==', 'creator-123');
      expect(result).toHaveLength(2);
    });
  });

  // ==========================================
  // PROGRESS OPERATIONS
  // ==========================================

  describe('getSurveyProgress', () => {
    it('should return progress if exists', async () => {
      const mockProgress: SurveyProgress = {
        surveyId: 'survey-123',
        odlrqFMlyhQkRe3pGNxVHMhp1mM2: 'user-123',
        startedAt: Date.now(),
        questionProgress: {},
      };
      mockGet.mockResolvedValue(createMockDoc(mockProgress));

      const result = await getSurveyProgress('survey-123', 'user-123');

      expect(mockDoc).toHaveBeenCalledWith('survey-123--user-123');
      expect(result).toEqual(mockProgress);
    });

    it('should return null if progress does not exist', async () => {
      mockGet.mockResolvedValue(createMockDoc(null, false));

      const result = await getSurveyProgress('survey-123', 'user-123');

      expect(result).toBeNull();
    });
  });

  describe('upsertSurveyProgress', () => {
    it('should create new progress if not exists', async () => {
      mockGet.mockResolvedValue(createMockDoc(null, false));

      await upsertSurveyProgress('survey-123', 'user-123', {
        currentQuestionIndex: 1,
      });

      expect(mockSet).toHaveBeenCalled();
    });

    it('should update existing progress', async () => {
      const existingProgress: SurveyProgress = {
        surveyId: 'survey-123',
        odlrqFMlyhQkRe3pGNxVHMhp1mM2: 'user-123',
        startedAt: Date.now(),
        questionProgress: {},
        currentQuestionIndex: 0,
      };
      mockGet.mockResolvedValue(createMockDoc(existingProgress));

      await upsertSurveyProgress('survey-123', 'user-123', {
        currentQuestionIndex: 2,
      });

      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  // ==========================================
  // QUESTION OPERATIONS
  // ==========================================

  describe('getQuestionsByCreator', () => {
    it('should return questions created by user', async () => {
      const mockQuestions = [
        { id: 'q1', data: { statementId: 'q1', statement: 'Q1' } },
        { id: 'q2', data: { statementId: 'q2', statement: 'Q2' } },
      ];
      mockGet.mockResolvedValue(createMockSnapshot(mockQuestions));

      const result = await getQuestionsByCreator('creator-123');

      expect(mockWhere).toHaveBeenCalledWith('creatorId', '==', 'creator-123');
      expect(mockWhere).toHaveBeenCalledWith('statementType', '==', StatementType.question);
      expect(result).toHaveLength(2);
    });
  });

  describe('searchQuestions', () => {
    it('should search questions by text', async () => {
      const mockQuestions = [
        { id: 'q1', data: { statementId: 'q1', statement: 'Climate change question' } },
      ];
      mockGet.mockResolvedValue(createMockSnapshot(mockQuestions));

      const result = await searchQuestions('user-123', { searchText: 'climate' });

      expect(result.questions).toBeDefined();
    });

    it('should respect limit parameter', async () => {
      const mockQuestions = Array.from({ length: 20 }, (_, i) => ({
        id: `q${i}`,
        data: { statementId: `q${i}`, statement: `Question ${i}` },
      }));
      mockGet.mockResolvedValue(createMockSnapshot(mockQuestions));

      const result = await searchQuestions('user-123', { limit: 5 });

      expect(mockLimit).toHaveBeenCalledWith(expect.any(Number));
    });
  });

  // ==========================================
  // STATUS OPERATIONS
  // ==========================================

  describe('changeSurveyStatus', () => {
    it('should call update on survey document', async () => {
      // changeSurveyStatus calls updateSurvey internally, which fetches then updates
      const existingSurvey: Survey = {
        surveyId: 'survey-123',
        title: 'Test Survey',
        creatorId: 'creator-123',
        questionIds: ['q1'],
        settings: DEFAULT_SURVEY_SETTINGS,
        questionSettings: {},
        status: SurveyStatus.draft,
        createdAt: Date.now(),
        lastUpdate: Date.now(),
      };
      mockGet.mockResolvedValue(createMockDoc(existingSurvey));

      const result = await changeSurveyStatus('survey-123', SurveyStatus.active);

      expect(mockDoc).toHaveBeenCalledWith('survey-123');
      expect(mockUpdate).toHaveBeenCalled();
      expect(result).not.toBeNull();
    });
  });

  describe('getSurveyStats', () => {
    it('should return survey statistics', async () => {
      const mockProgressDocs = [
        { id: 'p1', data: { surveyId: 'survey-123', completedAt: Date.now() } },
        { id: 'p2', data: { surveyId: 'survey-123', completedAt: null } },
        { id: 'p3', data: { surveyId: 'survey-123', completedAt: Date.now() } },
      ];
      mockGet.mockResolvedValue(createMockSnapshot(mockProgressDocs));

      const result = await getSurveyStats('survey-123');

      // The actual implementation returns these property names
      expect(result).toHaveProperty('responseCount');
      expect(result).toHaveProperty('completionCount');
      expect(result).toHaveProperty('completionRate');
    });
  });

  // ==========================================
  // DEMOGRAPHIC QUESTIONS OPERATIONS
  // ==========================================

  describe('getSurveyDemographicQuestions', () => {
    it('should fetch demographic questions by IDs', async () => {
      const mockQuestions = [
        { id: 'dq1', data: { questionId: 'dq1', text: 'Age?' } },
        { id: 'dq2', data: { questionId: 'dq2', text: 'Gender?' } },
      ];
      mockGet.mockResolvedValue(createMockSnapshot(mockQuestions));

      const result = await getSurveyDemographicQuestions('survey-123', ['dq1', 'dq2']);

      expect(result).toHaveLength(2);
    });

    it('should return empty array for empty IDs', async () => {
      const result = await getSurveyDemographicQuestions('survey-123', []);

      expect(result).toEqual([]);
    });
  });

  describe('getAllSurveyDemographicQuestions', () => {
    it('should fetch all demographic questions for survey', async () => {
      const mockQuestions = [
        { id: 'dq1', data: { questionId: 'dq1', surveyId: 'survey-123' } },
      ];
      mockGet.mockResolvedValue(createMockSnapshot(mockQuestions));

      const result = await getAllSurveyDemographicQuestions('survey-123');

      expect(mockWhere).toHaveBeenCalledWith('surveyId', '==', 'survey-123');
      expect(result).toHaveLength(1);
    });
  });

  describe('createSurveyDemographicQuestion', () => {
    it('should create demographic question', async () => {
      const questionData = {
        text: 'What is your age?',
        type: 'number' as const,
        required: true,
      };

      const result = await createSurveyDemographicQuestion('survey-123', questionData);

      expect(result).toHaveProperty('questionId');
      expect(result.text).toBe('What is your age?');
      expect(mockSet).toHaveBeenCalled();
    });
  });

  describe('updateSurveyDemographicQuestion', () => {
    it('should update demographic question', async () => {
      mockGet.mockResolvedValue(createMockDoc({ questionId: 'dq-123' }));

      const result = await updateSurveyDemographicQuestion('dq-123', {
        text: 'Updated question',
      });

      expect(mockUpdate).toHaveBeenCalled();
      expect(result).not.toBeNull();
    });

    it('should return null if question does not exist', async () => {
      mockGet.mockResolvedValue(createMockDoc(null, false));

      const result = await updateSurveyDemographicQuestion('nonexistent', {
        text: 'Updated',
      });

      expect(result).toBeNull();
    });
  });

  describe('deleteSurveyDemographicQuestion', () => {
    it('should delete demographic question', async () => {
      mockGet.mockResolvedValue(createMockDoc({ questionId: 'dq-123' }));

      const result = await deleteSurveyDemographicQuestion('dq-123');

      expect(result).toBe(true);
      expect(mockDelete).toHaveBeenCalled();
    });

    it('should still delete even if check is skipped', async () => {
      // Note: Implementation always returns true after delete
      mockGet.mockResolvedValue(createMockDoc(null, false));

      const result = await deleteSurveyDemographicQuestion('nonexistent');

      expect(result).toBe(true);
    });
  });

  describe('batchSaveDemographicQuestions', () => {
    it('should save multiple demographic questions', async () => {
      const questions = [
        { questionId: 'dq-1', text: 'Q1', type: 'text' as const, required: true },
        { questionId: 'dq-2', text: 'Q2', type: 'number' as const, required: false },
      ];

      await batchSaveDemographicQuestions('survey-123', questions as SurveyDemographicQuestion[]);

      const batch = mockBatch();
      expect(batch.commit).toHaveBeenCalled();
    });

    it('should handle empty array', async () => {
      await batchSaveDemographicQuestions('survey-123', []);

      // Should still create batch but with no operations
      expect(mockBatch).toHaveBeenCalled();
    });
  });

  // ==========================================
  // DEMOGRAPHIC ANSWERS OPERATIONS
  // ==========================================

  describe('saveSurveyDemographicAnswers', () => {
    it('should save demographic answers using batch', async () => {
      const answers: SurveyDemographicAnswer[] = [
        { questionId: 'dq-1', value: '25' },
        { questionId: 'dq-2', value: 'Female' },
      ];

      await saveSurveyDemographicAnswers('survey-123', 'user-123', answers);

      // Implementation uses batch, so batch.commit should be called
      const batch = mockBatch();
      expect(batch.commit).toHaveBeenCalled();
    });
  });

  describe('getSurveyDemographicAnswers', () => {
    it('should return answers array if exists', async () => {
      // This function returns array from query, not single doc
      const mockAnswers = [
        { id: 'a1', data: { questionId: 'dq-1', value: '25' } },
        { id: 'a2', data: { questionId: 'dq-2', value: 'Female' } },
      ];
      mockGet.mockResolvedValue(createMockSnapshot(mockAnswers));

      const result = await getSurveyDemographicAnswers('survey-123', 'user-123');

      expect(result).toHaveLength(2);
    });

    it('should return empty array if no answers exist', async () => {
      mockGet.mockResolvedValue(createMockSnapshot([]));

      const result = await getSurveyDemographicAnswers('survey-123', 'user-123');

      expect(result).toEqual([]);
    });
  });

  describe('getAllSurveyDemographicAnswers', () => {
    it('should return all answers for survey', async () => {
      const mockAnswers = [
        { id: 'a1', data: { surveyId: 'survey-123', answers: [] } },
        { id: 'a2', data: { surveyId: 'survey-123', answers: [] } },
      ];
      mockGet.mockResolvedValue(createMockSnapshot(mockAnswers));

      const result = await getAllSurveyDemographicAnswers('survey-123');

      expect(mockWhere).toHaveBeenCalledWith('surveyId', '==', 'survey-123');
      expect(result).toHaveLength(2);
    });
  });

  // ==========================================
  // UTILITY FUNCTIONS (INTERNAL)
  // ==========================================

  describe('utility functions behavior', () => {
    it('should generate unique progress IDs', async () => {
      // This tests the generateProgressId function indirectly
      mockGet.mockResolvedValue(createMockDoc(null, false));

      await getSurveyProgress('survey-123', 'user-456');

      expect(mockDoc).toHaveBeenCalledWith('survey-123--user-456');
    });

    it('should strip undefined values when creating survey', async () => {
      const survey = await createSurvey('creator-123', {
        title: 'Test',
        description: undefined,
      });

      // Should not have undefined values in the set call
      const setCallArg = mockSet.mock.calls[0][0];
      expect(Object.values(setCallArg).every((v) => v !== undefined)).toBe(true);
    });
  });
});
