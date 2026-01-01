/**
 * Tests for Firestore query functions
 */
import { Statement, StatementType, Evaluation, Collections } from '@freedi/shared-types';

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

jest.mock('@/lib/utils/proposalSampler', () => {
  return {
    ProposalSampler: jest.fn().mockImplementation(() => ({
      selectForUser: jest.fn().mockReturnValue([]),
      calculateStats: jest.fn().mockReturnValue({
        totalCount: 0,
        evaluatedCount: 0,
        stableCount: 0,
        remainingCount: 0,
      }),
    })),
  };
});

import { getFirestoreAdmin } from '../admin';
import {
  getQuestionFromFirebase,
  getRandomOptions,
  getAdaptiveBatch,
  getAllSolutionsSorted,
  getUserSolutions,
  getUserEvaluation,
  updateStatementConsensus,
} from '../queries';
import { ProposalSampler } from '@/lib/utils/proposalSampler';

describe('queries', () => {
  // Mock Firestore helpers
  const createMockDoc = (data: unknown, exists = true) => ({
    exists,
    data: () => data,
    id: 'mock-id',
  });

  const createMockSnapshot = (docs: unknown[]) => ({
    docs: docs.map((data, i) => ({
      data: () => data,
      id: `doc-${i}`,
    })),
    empty: docs.length === 0,
    size: docs.length,
  });

  const mockCollection = jest.fn();
  const mockDoc = jest.fn();
  const mockWhere = jest.fn();
  const mockLimit = jest.fn();
  const mockGet = jest.fn();
  const mockUpdate = jest.fn();

  const mockDb = {
    collection: mockCollection,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset chain mocks
    mockGet.mockResolvedValue(createMockSnapshot([]));
    mockLimit.mockReturnValue({ get: mockGet });
    mockWhere.mockReturnValue({ where: mockWhere, limit: mockLimit, get: mockGet });
    mockDoc.mockReturnValue({ get: mockGet, update: mockUpdate });
    mockCollection.mockReturnValue({ doc: mockDoc, where: mockWhere });

    (getFirestoreAdmin as jest.Mock).mockReturnValue(mockDb);
  });

  describe('getQuestionFromFirebase', () => {
    const createMockQuestion = (): Statement => ({
      statementId: 'question-123',
      statement: 'What is your solution?',
      statementType: StatementType.question,
      parentId: '',
      creator: {
        uid: 'creator-id',
        displayName: 'Creator',
        photoURL: '',
        email: 'creator@test.com',
        createdAt: Date.now(),
        lastSignInTime: Date.now(),
        role: 'user',
      },
      creatorId: 'creator-id',
      createdAt: Date.now(),
      lastUpdate: Date.now(),
      parents: [],
      topParentId: 'question-123',
      hasChildren: false,
      resultsSettings: { resultsBy: 'consensus', numberOfResults: 1 },
      results: [],
      consensus: 0,
    });

    it('should fetch and return a question statement', async () => {
      const mockQuestion = createMockQuestion();
      mockGet.mockResolvedValue(createMockDoc(mockQuestion));

      const result = await getQuestionFromFirebase('question-123');

      expect(mockCollection).toHaveBeenCalledWith(Collections.statements);
      expect(mockDoc).toHaveBeenCalledWith('question-123');
      expect(result.statementId).toBe('question-123');
      expect(result.statementType).toBe(StatementType.question);
    });

    it('should throw error if document does not exist', async () => {
      mockGet.mockResolvedValue(createMockDoc(null, false));

      await expect(getQuestionFromFirebase('nonexistent')).rejects.toThrow(
        'Question not found'
      );
    });

    it('should throw error if statement is not a question', async () => {
      const mockOption = {
        ...createMockQuestion(),
        statementType: StatementType.option,
      };
      mockGet.mockResolvedValue(createMockDoc(mockOption));

      await expect(getQuestionFromFirebase('option-id')).rejects.toThrow(
        'Statement is not a question'
      );
    });

    it('should sanitize statement (remove embedding)', async () => {
      const mockQuestionWithEmbedding = {
        ...createMockQuestion(),
        embedding: [0.1, 0.2, 0.3],
      };
      mockGet.mockResolvedValue(createMockDoc(mockQuestionWithEmbedding));

      const result = await getQuestionFromFirebase('question-123');

      expect((result as Record<string, unknown>).embedding).toBeUndefined();
    });
  });

  describe('getRandomOptions', () => {
    const createMockOption = (id: string, randomSeed = 0.5): Statement => ({
      statementId: id,
      statement: `Option ${id}`,
      statementType: StatementType.option,
      parentId: 'question-123',
      creator: {
        uid: 'creator-id',
        displayName: 'Creator',
        photoURL: '',
        email: 'creator@test.com',
        createdAt: Date.now(),
        lastSignInTime: Date.now(),
        role: 'user',
      },
      creatorId: 'creator-id',
      createdAt: Date.now(),
      lastUpdate: Date.now(),
      parents: ['question-123'],
      topParentId: 'question-123',
      hasChildren: false,
      resultsSettings: { resultsBy: 'consensus', numberOfResults: 1 },
      results: [],
      consensus: 0,
      randomSeed,
    });

    it('should fetch random options for a question', async () => {
      const mockOptions = [
        createMockOption('opt-1'),
        createMockOption('opt-2'),
        createMockOption('opt-3'),
      ];
      mockGet.mockResolvedValue(createMockSnapshot(mockOptions));

      const result = await getRandomOptions('question-123');

      expect(mockCollection).toHaveBeenCalledWith(Collections.statements);
      expect(result.length).toBeLessThanOrEqual(6); // default size
    });

    it('should respect size parameter', async () => {
      const mockOptions = Array.from({ length: 10 }, (_, i) =>
        createMockOption(`opt-${i}`)
      );
      mockGet.mockResolvedValue(createMockSnapshot(mockOptions));

      const result = await getRandomOptions('question-123', { size: 3 });

      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('should filter out hidden options', async () => {
      const mockOptions = [
        createMockOption('opt-1'),
        { ...createMockOption('opt-2'), hide: true },
        createMockOption('opt-3'),
      ];
      mockGet.mockResolvedValue(createMockSnapshot(mockOptions));

      const result = await getRandomOptions('question-123');

      expect(result.find((o) => o.statementId === 'opt-2')).toBeUndefined();
    });

    it('should exclude specific IDs', async () => {
      const mockOptions = [
        createMockOption('opt-1'),
        createMockOption('opt-2'),
        createMockOption('opt-3'),
      ];
      mockGet.mockResolvedValue(createMockSnapshot(mockOptions));

      const result = await getRandomOptions('question-123', {
        excludeIds: ['opt-1', 'opt-2'],
      });

      // opt-1 and opt-2 should be excluded
      expect(result.find((o) => o.statementId === 'opt-1')).toBeUndefined();
      expect(result.find((o) => o.statementId === 'opt-2')).toBeUndefined();
    });

    it('should exclude already evaluated options for user', async () => {
      const mockOptions = [
        createMockOption('opt-1'),
        createMockOption('opt-2'),
        createMockOption('opt-3'),
      ];
      const mockEvaluations = [
        { statementId: 'opt-1' } as Evaluation,
      ];

      // First call for evaluations, second for options
      mockGet
        .mockResolvedValueOnce(createMockSnapshot(mockEvaluations))
        .mockResolvedValue(createMockSnapshot(mockOptions));

      const result = await getRandomOptions('question-123', {
        userId: 'user-123',
      });

      // opt-1 should be excluded (already evaluated)
      expect(result.find((o) => o.statementId === 'opt-1')).toBeUndefined();
    });
  });

  describe('getAdaptiveBatch', () => {
    const createMockOption = (id: string): Statement => ({
      statementId: id,
      statement: `Option ${id}`,
      statementType: StatementType.option,
      parentId: 'question-123',
      creator: {
        uid: 'creator-id',
        displayName: 'Creator',
        photoURL: '',
        email: 'creator@test.com',
        createdAt: Date.now(),
        lastSignInTime: Date.now(),
        role: 'user',
      },
      creatorId: 'creator-id',
      createdAt: Date.now(),
      lastUpdate: Date.now(),
      parents: ['question-123'],
      topParentId: 'question-123',
      hasChildren: false,
      resultsSettings: { resultsBy: 'consensus', numberOfResults: 1 },
      results: [],
      consensus: 0,
    });

    beforeEach(() => {
      // Reset ProposalSampler mock
      (ProposalSampler as jest.Mock).mockImplementation(() => ({
        selectForUser: jest.fn().mockReturnValue([
          createMockOption('selected-1'),
          createMockOption('selected-2'),
        ]),
        calculateStats: jest.fn().mockReturnValue({
          totalCount: 5,
          evaluatedCount: 2,
          stableCount: 1,
          remainingCount: 2,
        }),
      }));
    });

    it('should return batch result with solutions', async () => {
      const mockOptions = [
        createMockOption('opt-1'),
        createMockOption('opt-2'),
        createMockOption('opt-3'),
      ];
      mockGet.mockResolvedValue(createMockSnapshot(mockOptions));

      const result = await getAdaptiveBatch('question-123');

      expect(result).toHaveProperty('solutions');
      expect(result).toHaveProperty('hasMore');
      expect(result).toHaveProperty('stats');
    });

    it('should return empty result when no proposals', async () => {
      mockGet.mockResolvedValue(createMockSnapshot([]));

      const result = await getAdaptiveBatch('question-123');

      expect(result.solutions).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.stats.totalCount).toBe(0);
    });

    it('should filter hidden proposals', async () => {
      const mockOptions = [
        createMockOption('opt-1'),
        { ...createMockOption('opt-2'), hide: true },
      ];
      mockGet.mockResolvedValue(createMockSnapshot(mockOptions));

      await getAdaptiveBatch('question-123');

      // ProposalSampler should receive only non-hidden proposals
      expect(ProposalSampler).toHaveBeenCalled();
    });

    it('should use ProposalSampler for selection', async () => {
      const mockOptions = [createMockOption('opt-1')];
      mockGet.mockResolvedValue(createMockSnapshot(mockOptions));

      await getAdaptiveBatch('question-123', 'user-123');

      expect(ProposalSampler).toHaveBeenCalled();
    });

    it('should respect custom config', async () => {
      const mockOptions = [createMockOption('opt-1')];
      mockGet.mockResolvedValue(createMockSnapshot(mockOptions));

      await getAdaptiveBatch('question-123', undefined, {
        config: { targetEvaluations: 50 },
      });

      expect(ProposalSampler).toHaveBeenCalledWith({ targetEvaluations: 50 });
    });

    it('should throw error on query failure', async () => {
      mockGet.mockRejectedValue(new Error('Query failed'));

      await expect(getAdaptiveBatch('question-123')).rejects.toThrow('Query failed');
    });
  });

  describe('getAllSolutionsSorted', () => {
    const createMockOption = (
      id: string,
      agreement: number
    ): Statement => ({
      statementId: id,
      statement: `Option ${id}`,
      statementType: StatementType.option,
      parentId: 'question-123',
      creator: {
        uid: 'creator-id',
        displayName: 'Creator',
        photoURL: '',
        email: 'creator@test.com',
        createdAt: Date.now(),
        lastSignInTime: Date.now(),
        role: 'user',
      },
      creatorId: 'creator-id',
      createdAt: Date.now(),
      lastUpdate: Date.now(),
      parents: ['question-123'],
      topParentId: 'question-123',
      hasChildren: false,
      resultsSettings: { resultsBy: 'consensus', numberOfResults: 1 },
      results: [],
      consensus: 0,
      evaluation: {
        statementId: id,
        parentId: 'question-123',
        evaluationId: 'eval-id',
        topParentId: 'question-123',
        sumEvaluations: 0,
        sumSquaredEvaluations: 0,
        numberOfEvaluators: 0,
        agreement,
      },
    });

    it('should return solutions sorted by agreement', async () => {
      const mockOptions = [
        createMockOption('low', 0.3),
        createMockOption('high', 0.9),
        createMockOption('medium', 0.6),
      ];
      mockGet.mockResolvedValue(createMockSnapshot(mockOptions));

      const result = await getAllSolutionsSorted('question-123');

      expect(result[0].statementId).toBe('high');
      expect(result[1].statementId).toBe('medium');
      expect(result[2].statementId).toBe('low');
    });

    it('should respect limit parameter', async () => {
      const mockOptions = Array.from({ length: 20 }, (_, i) =>
        createMockOption(`opt-${i}`, i * 0.05)
      );
      mockGet.mockResolvedValue(createMockSnapshot(mockOptions));

      const result = await getAllSolutionsSorted('question-123', 5);

      expect(result.length).toBe(5);
    });

    it('should filter hidden statements', async () => {
      const mockOptions = [
        createMockOption('visible', 0.8),
        { ...createMockOption('hidden', 0.9), hide: true },
      ];
      mockGet.mockResolvedValue(createMockSnapshot(mockOptions));

      const result = await getAllSolutionsSorted('question-123');

      expect(result.find((s) => s.statementId === 'hidden')).toBeUndefined();
    });

    it('should fallback to consensus for legacy data', async () => {
      const legacyOption = {
        statementId: 'legacy',
        statement: 'Legacy option',
        statementType: StatementType.option,
        parentId: 'question-123',
        consensus: 0.75,
        // No evaluation field
      } as Statement;
      mockGet.mockResolvedValue(createMockSnapshot([legacyOption]));

      const result = await getAllSolutionsSorted('question-123');

      expect(result).toHaveLength(1);
    });

    it('should throw error on query failure', async () => {
      mockGet.mockRejectedValue(new Error('Query failed'));

      await expect(getAllSolutionsSorted('question-123')).rejects.toThrow(
        'Query failed'
      );
    });
  });

  describe('getUserSolutions', () => {
    const createMockOption = (id: string): Statement => ({
      statementId: id,
      statement: `Option ${id}`,
      statementType: StatementType.option,
      parentId: 'question-123',
      creator: {
        uid: 'user-123',
        displayName: 'User',
        photoURL: '',
        email: 'user@test.com',
        createdAt: Date.now(),
        lastSignInTime: Date.now(),
        role: 'user',
      },
      creatorId: 'user-123',
      createdAt: Date.now(),
      lastUpdate: Date.now(),
      parents: ['question-123'],
      topParentId: 'question-123',
      hasChildren: false,
      resultsSettings: { resultsBy: 'consensus', numberOfResults: 1 },
      results: [],
      consensus: 0,
    });

    it('should fetch user solutions', async () => {
      const mockOptions = [createMockOption('user-opt-1'), createMockOption('user-opt-2')];
      mockGet.mockResolvedValue(createMockSnapshot(mockOptions));

      const result = await getUserSolutions('question-123', 'user-123');

      expect(mockWhere).toHaveBeenCalledWith('creatorId', '==', 'user-123');
      expect(result).toHaveLength(2);
    });

    it('should filter hidden statements', async () => {
      const mockOptions = [
        createMockOption('visible'),
        { ...createMockOption('hidden'), hide: true },
      ];
      mockGet.mockResolvedValue(createMockSnapshot(mockOptions));

      const result = await getUserSolutions('question-123', 'user-123');

      expect(result.find((s) => s.statementId === 'hidden')).toBeUndefined();
    });

    it('should throw error on query failure', async () => {
      mockGet.mockRejectedValue(new Error('Query failed'));

      await expect(getUserSolutions('question-123', 'user-123')).rejects.toThrow(
        'Query failed'
      );
    });
  });

  describe('getUserEvaluation', () => {
    it('should return evaluation if exists', async () => {
      const mockEvaluation: Evaluation = {
        evaluationId: 'user-123--statement-456',
        statementId: 'statement-456',
        evaluatorId: 'user-123',
        parentId: 'question-123',
        topParentId: 'question-123',
        evaluation: 0.8,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      mockGet.mockResolvedValue(createMockDoc(mockEvaluation));

      const result = await getUserEvaluation('user-123', 'statement-456');

      expect(mockDoc).toHaveBeenCalledWith('user-123--statement-456');
      expect(result).toEqual(mockEvaluation);
    });

    it('should return null if evaluation does not exist', async () => {
      mockGet.mockResolvedValue(createMockDoc(null, false));

      const result = await getUserEvaluation('user-123', 'statement-456');

      expect(result).toBeNull();
    });
  });

  describe('updateStatementConsensus', () => {
    it('should calculate and update consensus', async () => {
      const mockEvaluations = [
        { evaluation: 0.8 },
        { evaluation: 0.6 },
        { evaluation: 0.4 },
      ];
      mockGet.mockResolvedValue(createMockSnapshot(mockEvaluations));
      mockUpdate.mockResolvedValue(undefined);

      await updateStatementConsensus('statement-123');

      // Average: (0.8 + 0.6 + 0.4) / 3 = 0.6
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          consensus: 0.6,
          lastUpdate: expect.any(Number),
        })
      );
    });

    it('should not update if no evaluations exist', async () => {
      mockGet.mockResolvedValue(createMockSnapshot([]));

      await updateStatementConsensus('statement-123');

      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('should query evaluations by statementId', async () => {
      mockGet.mockResolvedValue(createMockSnapshot([]));

      await updateStatementConsensus('statement-123');

      expect(mockWhere).toHaveBeenCalledWith('statementId', '==', 'statement-123');
    });
  });
});
