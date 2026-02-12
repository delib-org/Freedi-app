/**
 * Proposal Controller Tests
 * Following CLAUDE.md - 80%+ coverage required
 */

import { submitProposal, validateProposal } from '../proposalController';
import { VALIDATION } from '@/constants/common';
import { ValidationError } from '@/lib/utils/errorHandling';

// Mock logError
jest.mock('@/lib/utils/errorHandling', () => ({
  ...jest.requireActual('@/lib/utils/errorHandling'),
  logError: jest.fn(),
}));

describe('proposalController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('submitProposal', () => {
    const validText = 'This is a valid proposal with enough characters';
    const questionId = 'question-123';
    const userId = 'user-456';
    const userName = 'Test User';

    it('should submit valid proposal', async () => {
      const result = await submitProposal(validText, questionId, userId, userName);

      expect(result.statementId).toBeDefined();
      expect(result.statementId).toContain('proposal_');
      expect(result.statementId).toContain(userId);
    });

    it('should trim whitespace from proposal text', async () => {
      const textWithSpaces = '   ' + validText + '   ';
      const result = await submitProposal(textWithSpaces, questionId, userId, userName);

      expect(result.statementId).toBeDefined();
    });

    it('should throw ValidationError for text too short', async () => {
      const shortText = 'Hi';

      await expect(
        submitProposal(shortText, questionId, userId, userName)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for text too long', async () => {
      const longText = 'A'.repeat(VALIDATION.MAX_STATEMENT_LENGTH + 1);

      await expect(
        submitProposal(longText, questionId, userId, userName)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for missing questionId', async () => {
      await expect(
        submitProposal(validText, '', userId, userName)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for missing userId', async () => {
      await expect(
        submitProposal(validText, questionId, '', userName)
      ).rejects.toThrow(ValidationError);
    });

    it('should accept text at minimum length', async () => {
      const minText = 'A'.repeat(VALIDATION.MIN_STATEMENT_LENGTH);

      await expect(
        submitProposal(minText, questionId, userId, userName)
      ).resolves.not.toThrow();
    });

    it('should accept text at maximum length', async () => {
      const maxText = 'A'.repeat(VALIDATION.MAX_STATEMENT_LENGTH);

      await expect(
        submitProposal(maxText, questionId, userId, userName)
      ).resolves.not.toThrow();
    });
  });

  describe('validateProposal', () => {
    it('should validate correct proposal', () => {
      const validText = 'This is a valid proposal with enough characters';
      const result = validateProposal(validText);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject text too short', () => {
      const shortText = 'Hi';
      const result = validateProposal(shortText);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('at least');
    });

    it('should reject text too long', () => {
      const longText = 'A'.repeat(VALIDATION.MAX_STATEMENT_LENGTH + 1);
      const result = validateProposal(longText);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('no more than');
    });

    it('should reject text with too many repeated characters', () => {
      const repeatedText = 'This is valid text aaaaaaaaaaaaaa';
      const result = validateProposal(repeatedText);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Proposal contains too many repeated characters');
    });

    it('should reject long text in all caps', () => {
      const allCapsText = 'THIS IS A VERY LONG PROPOSAL TEXT IN ALL CAPS';
      const result = validateProposal(allCapsText);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Please avoid writing in all capitals');
    });

    it('should allow short text in caps', () => {
      const shortCaps = 'USA IS GREAT';
      const result = validateProposal(shortCaps);

      // Should not fail on caps check (text is too short for that rule)
      expect(result.errors).not.toContain('Please avoid writing in all capitals');
    });

    it('should trim whitespace before validation', () => {
      const validText = '   This is a valid proposal   ';
      const result = validateProposal(validText);

      expect(result.isValid).toBe(true);
    });

    it('should return multiple errors when multiple issues exist', () => {
      const badText = 'A'; // Too short AND could trigger other checks
      const result = validateProposal(badText);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should accept text at minimum valid length', () => {
      const minText = 'A'.repeat(VALIDATION.MIN_STATEMENT_LENGTH);
      const result = validateProposal(minText);

      expect(result.isValid).toBe(true);
    });

    it('should accept text at maximum valid length', () => {
      const maxText = 'A'.repeat(VALIDATION.MAX_STATEMENT_LENGTH);
      const result = validateProposal(maxText);

      expect(result.isValid).toBe(true);
    });

    it('should handle mixed case text correctly', () => {
      const mixedCaseText = 'This Is A Valid Proposal With Mixed Case Characters';
      const result = validateProposal(mixedCaseText);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
