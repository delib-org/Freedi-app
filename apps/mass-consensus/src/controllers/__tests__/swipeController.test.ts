/**
 * Swipe Controller Tests
 * Following CLAUDE.md - 80%+ coverage required
 */

import { submitRating, loadCardBatch, syncPendingEvaluations } from '../swipeController';
import { RATING, SWIPE } from '@/constants/common';
import { ValidationError } from '@/lib/utils/errorHandling';

// Mock logError
jest.mock('@/lib/utils/errorHandling', () => ({
  ...jest.requireActual('@/lib/utils/errorHandling'),
  logError: jest.fn(),
}));

describe('swipeController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('submitRating', () => {
    it('should accept valid rating', async () => {
      await expect(
        submitRating('stmt1', RATING.AGREE, 'user1')
      ).resolves.not.toThrow();
    });

    it('should throw ValidationError for invalid rating', async () => {
      await expect(
        submitRating('stmt1', 999, 'user1')
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for missing statementId', async () => {
      await expect(
        submitRating('', RATING.AGREE, 'user1')
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for missing userId', async () => {
      await expect(
        submitRating('stmt1', RATING.AGREE, '')
      ).rejects.toThrow(ValidationError);
    });

    it('should accept all valid rating values', async () => {
      const validRatings = [
        RATING.STRONGLY_DISAGREE,
        RATING.DISAGREE,
        RATING.NEUTRAL,
        RATING.AGREE,
        RATING.STRONGLY_AGREE,
      ];

      for (const rating of validRatings) {
        await expect(
          submitRating('stmt1', rating, 'user1')
        ).resolves.not.toThrow();
      }
    });
  });

  describe('loadCardBatch', () => {
    it('should accept valid questionId', async () => {
      const result = await loadCardBatch('q1', SWIPE.BATCH_SIZE, 'user1');
      expect(Array.isArray(result)).toBe(true);
    });

    it('should throw ValidationError for missing questionId', async () => {
      await expect(
        loadCardBatch('', SWIPE.BATCH_SIZE)
      ).rejects.toThrow(ValidationError);
    });

    it('should use default batch size', async () => {
      await expect(
        loadCardBatch('q1')
      ).resolves.not.toThrow();
    });

    it('should accept custom limit', async () => {
      const result = await loadCardBatch('q1', 5);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('syncPendingEvaluations', () => {
    it('should handle empty array', async () => {
      await expect(
        syncPendingEvaluations([], 'user1')
      ).resolves.not.toThrow();
    });

    it('should sync multiple evaluations', async () => {
      const pending = [
        { statementId: 'stmt1', rating: RATING.AGREE, timestamp: Date.now() },
        { statementId: 'stmt2', rating: RATING.STRONGLY_AGREE, timestamp: Date.now() },
      ];

      await expect(
        syncPendingEvaluations(pending, 'user1')
      ).resolves.not.toThrow();
    });

    it('should continue on individual failures', async () => {
      const pending = [
        { statementId: '', rating: RATING.AGREE, timestamp: Date.now() }, // Invalid - will fail
        { statementId: 'stmt2', rating: RATING.STRONGLY_AGREE, timestamp: Date.now() }, // Valid
      ];

      // Should not throw even though first evaluation fails
      await expect(
        syncPendingEvaluations(pending, 'user1')
      ).resolves.not.toThrow();
    });
  });
});
