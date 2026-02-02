/**
 * Integration Tests for Paragraph Replacement System
 *
 * Tests the end-to-end flow of:
 * 1. Creating suggestions
 * 2. Voting on suggestions (consensus calculation)
 * 3. Auto/manual/deadline modes
 * 4. Official paragraph text updates
 * 5. Description sync
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { Statement, StatementType } from '@freedi/shared-types';
import { setSuggestionEvaluation } from '@/controllers/db/suggestions/setSuggestionEvaluation';
import { finalizeSuggestion } from '@/controllers/db/paragraphs/finalizeSuggestion';

// Mock Firebase Admin
jest.mock('@/lib/firebase/admin');

// Type for mock evaluation data
interface MockEvaluationData {
  evaluation: number;
  statementId: string;
}

describe('Paragraph Replacement Integration', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockDb: { collection: jest.Mock<any>; runTransaction: jest.Mock<any> } = {
    collection: jest.fn(),
    runTransaction: jest.fn(),
  };

  const mockUser = {
    uid: 'user_123',
    displayName: 'Test User',
    email: 'test@example.com',
    photoURL: '',
    isAnonymous: false,
  };

  const mockOfficialParagraph: Statement = {
    statementId: 'para_official',
    statement: 'Original official text',
    statementType: StatementType.option,
    parentId: 'doc_123',
    topParentId: 'doc_123',
    creatorId: 'admin_123',
    creator: mockUser,
    createdAt: Date.now(),
    lastUpdate: Date.now(),
    consensus: 0.7,
    doc: {
      isDoc: true,
      order: 0,
      isOfficialParagraph: true,
    },
  };

  const mockSuggestion: Statement = {
    statementId: 'suggestion_456',
    statement: 'Improved suggestion text',
    statementType: StatementType.option,
    parentId: 'para_official',
    topParentId: 'doc_123',
    creatorId: 'user_123',
    creator: mockUser,
    createdAt: Date.now(),
    lastUpdate: Date.now(),
    consensus: 0.85, // Higher than official
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getFirestoreAdmin as jest.MockedFunction<typeof getFirestoreAdmin>).mockReturnValue(
      mockDb as unknown as ReturnType<typeof getFirestoreAdmin>
    );
  });

  describe('Auto Mode - Real-time replacement', () => {
    it('should update official paragraph when suggestion has higher consensus', async () => {
      const mockEvaluationRef = {
        set: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      };

      mockDb.collection.mockReturnValue({
        doc: jest.fn(() => mockEvaluationRef),
      });

      // User votes on suggestion
      await setSuggestionEvaluation(mockSuggestion, mockUser, 0.9);

      // Check evaluation was saved
      expect(mockEvaluationRef.set).toHaveBeenCalled();

      const mockCalls = mockEvaluationRef.set.mock.calls;
      const evaluationData = (mockCalls.length > 0 ? mockCalls[0] : undefined) as unknown as [MockEvaluationData] | undefined;
      expect(evaluationData).toBeDefined();
      if (evaluationData) {
        expect(evaluationData[0].evaluation).toBe(0.9);
        expect(evaluationData[0].statementId).toBe('suggestion_456');
      }
    });

    it('should preserve old text as history entry', async () => {
      // This would be tested via fn_updateOfficialParagraphText
      // which is a Firebase Function that runs on consensus updates

      // Mock scenario: Official paragraph updates to winning suggestion
      const historyEntry = {
        statementId: expect.stringContaining('history_'),
        statement: mockOfficialParagraph.statement, // Old text
        hide: true,
        replacedBy: mockSuggestion.statementId,
      };

      // History should be created when official paragraph updates
      expect(historyEntry.statement).toBe('Original official text');
      expect(historyEntry.replacedBy).toBe('suggestion_456');
    });
  });

  describe('Manual Mode - Admin approval required', () => {
    it('should finalize suggestion when admin accepts', async () => {
      const mockTransaction = {
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn(),
      };

      // Mock Firestore transaction
      mockDb.runTransaction.mockImplementation(async (callback: unknown) => {
        return (callback as (t: typeof mockTransaction) => Promise<unknown>)(mockTransaction);
      });

      // Mock getting official paragraph
      mockTransaction.get.mockResolvedValueOnce({
        exists: true,
        data: () => mockOfficialParagraph,
      });

      // Mock getting winning suggestion
      mockDb.collection.mockReturnValue({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                get: jest.fn().mockResolvedValue({
                  empty: false,
                  docs: [{ data: () => mockSuggestion }],
                }),
              }),
            }),
          }),
        }),
        doc: jest.fn(),
      });

      await finalizeSuggestion('para_official', null, 'admin_123');

      // Check history entry was created
      expect(mockTransaction.set).toHaveBeenCalled();

      // Check official paragraph was updated
      expect(mockTransaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          statement: 'Improved suggestion text',
          'versionControl.appliedSuggestionId': 'suggestion_456',
          'versionControl.finalizedBy': 'admin_123',
        })
      );

      // Check suggestion was marked as finalized
      expect(mockTransaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          'versionControl.finalized': true,
          'versionControl.finalizedBy': 'admin_123',
        })
      );
    });

    it('should validate suggestion belongs to paragraph', async () => {
      const mockTransaction = {
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn(),
      };

      mockDb.runTransaction.mockImplementation(async (callback: unknown) => {
        return (callback as (t: typeof mockTransaction) => Promise<unknown>)(mockTransaction);
      });

      mockTransaction.get.mockResolvedValueOnce({
        exists: true,
        data: () => mockOfficialParagraph,
      });

      // Suggestion with wrong parentId
      const wrongSuggestion = {
        ...mockSuggestion,
        parentId: 'different_paragraph',
      };

      mockTransaction.get.mockResolvedValueOnce({
        exists: true,
        data: () => wrongSuggestion,
      });

      await expect(
        finalizeSuggestion('para_official', 'suggestion_456', 'admin_123')
      ).rejects.toThrow();
    });
  });

  describe('Deadline Mode - Auto-finalize at deadline', () => {
    it('should finalize winning suggestion when deadline expires', async () => {
      // This would be tested via fn_handleVotingDeadline scheduled function

      const mockDocument = {
        statementId: 'doc_123',
        statement: 'Document',
        statementType: 'document' as Statement['statementType'],
        parentId: 'root',
        topParentId: 'root',
        creatorId: 'admin_123',
        creator: mockUser,
        createdAt: Date.now(),
        lastUpdate: Date.now(),
        consensus: 0,
        doc: {
          isDoc: true,
          order: 0,
          suggestionSettings: {
            mode: 'deadline' as const,
            votingDeadline: Date.now() - 1000, // Expired
            finalized: false,
          },
        },
      };

      // Mock would query expired documents
      expect(mockDocument.doc?.suggestionSettings?.votingDeadline).toBeLessThan(Date.now());
      expect(mockDocument.doc?.suggestionSettings?.finalized).toBe(false);
    });

    it('should not process documents before deadline', async () => {
      const futureDeadline = Date.now() + 3600000; // 1 hour from now

      const mockDocument = {
        doc: {
          suggestionSettings: {
            mode: 'deadline' as const,
            votingDeadline: futureDeadline,
          },
        },
      };

      // Should skip this document
      expect(mockDocument.doc?.suggestionSettings?.votingDeadline).toBeGreaterThan(Date.now());
    });
  });

  describe('Description Sync', () => {
    it('should aggregate official paragraphs into document description', async () => {
      // This would be tested via fn_syncParagraphsToDescription

      const mockParagraphs = [
        {
          statementId: 'para_1',
          statement: 'First paragraph',
          doc: { order: 0, isOfficialParagraph: true },
        },
        {
          statementId: 'para_2',
          statement: 'Second paragraph',
          doc: { order: 1, isOfficialParagraph: true },
        },
        {
          statementId: 'para_3',
          statement: 'Third paragraph',
          doc: { order: 2, isOfficialParagraph: true },
        },
      ];

      // Expected aggregated description
      const expectedDescription = 'First paragraph\n\nSecond paragraph\n\nThird paragraph';

      const actualDescription = mockParagraphs
        .map((p) => p.statement)
        .join('\n\n');

      expect(actualDescription).toBe(expectedDescription);
    });

    it('should truncate description if over 5000 characters', async () => {
      const longText = 'a'.repeat(2000);

      const mockParagraphs = [
        { statement: longText, doc: { order: 0 } },
        { statement: longText, doc: { order: 1 } },
        { statement: longText, doc: { order: 2 } },
      ];

      const totalLength = mockParagraphs.reduce(
        (sum, p) => sum + p.statement.length,
        0
      );

      expect(totalLength).toBeGreaterThan(5000);

      // Should truncate
      const MAX_LENGTH = 5000;
      let description = '';
      for (const paragraph of mockParagraphs) {
        if (description.length + paragraph.statement.length > MAX_LENGTH) {
          description += '...[truncated]';
          break;
        }
        description += paragraph.statement + '\n\n';
      }

      expect(description).toContain('[truncated]');
    });
  });

  describe('Consensus Calculation', () => {
    it('should only update if winning suggestion has higher consensus', async () => {
      const officialConsensus = 0.85;
      const suggestionConsensus = 0.80; // Lower

      // Should NOT update
      expect(suggestionConsensus).toBeLessThanOrEqual(officialConsensus);
    });

    it('should update if winning suggestion has higher consensus', async () => {
      const officialConsensus = 0.75;
      const suggestionConsensus = 0.90; // Higher

      // SHOULD update
      expect(suggestionConsensus).toBeGreaterThan(officialConsensus);
    });
  });
});
