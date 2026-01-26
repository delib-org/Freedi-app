/**
 * Tests for migrateParagraphsToStatements
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { migrateParagraphsToStatements, checkIfMigrated } from '../migrateParagraphsToStatements';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { Collections, Statement, ParagraphType } from '@freedi/shared-types';

// Mock Firebase Admin
jest.mock('@/lib/firebase/admin');

describe('migrateParagraphsToStatements', () => {
  const mockDb = {
    collection: jest.fn(),
  };

  const mockDocRef = {
    get: jest.fn(),
  };

  const mockCollectionRef = {
    doc: jest.fn(() => mockDocRef),
    where: jest.fn(() => ({
      where: jest.fn(() => ({
        limit: jest.fn(() => ({
          get: jest.fn(),
        })),
      })),
    })),
  };

  const mockBatch = {
    set: jest.fn(),
    commit: jest.fn(() => Promise.resolve()),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getFirestoreAdmin as jest.MockedFunction<typeof getFirestoreAdmin>).mockReturnValue(
      mockDb as any
    );
    mockDb.collection.mockReturnValue(mockCollectionRef as any);
    (mockDb as any).batch = jest.fn(() => mockBatch);
  });

  describe('checkIfMigrated', () => {
    it('should return true if official paragraphs exist', async () => {
      const mockSnapshot = {
        empty: false,
      };

      mockCollectionRef.where.mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(mockSnapshot),
          }),
        }),
      });

      const result = await checkIfMigrated('doc_123');

      expect(result).toBe(true);
    });

    it('should return false if no official paragraphs exist', async () => {
      const mockSnapshot = {
        empty: true,
      };

      mockCollectionRef.where.mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(mockSnapshot),
          }),
        }),
      });

      const result = await checkIfMigrated('doc_123');

      expect(result).toBe(false);
    });
  });

  describe('migrateParagraphsToStatements', () => {
    const mockDocument: Statement = {
      statementId: 'doc_123',
      statement: 'Document title',
      statementType: 'document' as any,
      parentId: 'root',
      topParentId: 'root',
      creatorId: 'user_123',
      creator: {
        uid: 'user_123',
        displayName: 'Test User',
        email: 'test@example.com',
        photoURL: '',
        isAnonymous: false,
      },
      createdAt: Date.now(),
      lastUpdate: Date.now(),
      consensus: 0,
      paragraphs: [
        {
          paragraphId: 'p_1',
          type: ParagraphType.h1,
          content: 'Header 1',
          order: 0,
        },
        {
          paragraphId: 'p_2',
          type: ParagraphType.paragraph,
          content: 'Paragraph text',
          order: 1,
        },
      ],
    };

    it('should skip if already migrated', async () => {
      // Mock already migrated
      mockCollectionRef.where.mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ empty: false }),
          }),
        }),
      });

      const count = await migrateParagraphsToStatements('doc_123', 'user_123');

      expect(count).toBe(0);
    });

    it('should create official paragraph statements', async () => {
      // Mock not migrated
      mockCollectionRef.where.mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ empty: true }),
          }),
        }),
      });

      // Mock document fetch
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => mockDocument,
      });

      // Mock user fetch
      mockCollectionRef.doc.mockImplementation((id: string) => {
        if (id === 'user_123') {
          return {
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => mockDocument.creator,
            }),
          };
        }
        return mockDocRef;
      });

      const count = await migrateParagraphsToStatements('doc_123', 'user_123');

      expect(count).toBe(2); // 2 paragraphs migrated
      expect(mockBatch.set).toHaveBeenCalledTimes(2);
      expect(mockBatch.commit).toHaveBeenCalled();
    });

    it('should handle document not found', async () => {
      mockCollectionRef.where.mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ empty: true }),
          }),
        }),
      });

      mockDocRef.get.mockResolvedValue({
        exists: false,
      });

      await expect(migrateParagraphsToStatements('doc_123', 'user_123')).rejects.toThrow();
    });

    it('should handle empty paragraphs array', async () => {
      mockCollectionRef.where.mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ empty: true }),
          }),
        }),
      });

      const emptyDocument = {
        ...mockDocument,
        paragraphs: [],
      };

      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => emptyDocument,
      });

      const count = await migrateParagraphsToStatements('doc_123', 'user_123');

      expect(count).toBe(0);
    });

    it('should preserve paragraph order', async () => {
      mockCollectionRef.where.mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ empty: true }),
          }),
        }),
      });

      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => mockDocument,
      });

      mockCollectionRef.doc.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => mockDocument.creator,
        }),
      });

      await migrateParagraphsToStatements('doc_123', 'user_123');

      // Check that paragraphs maintain order
      const calls = mockBatch.set.mock.calls;
      expect(calls.length).toBe(2);

      const firstParagraph = calls[0][1] as Statement;
      const secondParagraph = calls[1][1] as Statement;

      expect(firstParagraph.doc?.order).toBe(0);
      expect(secondParagraph.doc?.order).toBe(1);
    });

    it('should mark paragraphs as official', async () => {
      mockCollectionRef.where.mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ empty: true }),
          }),
        }),
      });

      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => mockDocument,
      });

      mockCollectionRef.doc.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => mockDocument.creator,
        }),
      });

      await migrateParagraphsToStatements('doc_123', 'user_123');

      const calls = mockBatch.set.mock.calls;

      calls.forEach((call) => {
        const statement = call[1] as Statement;
        expect(statement.doc?.isOfficialParagraph).toBe(true);
      });
    });
  });
});
