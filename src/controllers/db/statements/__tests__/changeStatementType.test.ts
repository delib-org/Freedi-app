// Jest test file
import { getDoc, updateDoc, getDocs, doc } from 'firebase/firestore';
import { StatementType, Statement, QuestionType, EvaluationUI } from '@freedi/shared-types';
import { changeStatementType } from '../changeStatementType';

// Mock Firebase Firestore
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
  updateDoc: jest.fn(),
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  getDocs: jest.fn(),
}));

// Mock the Firebase config
jest.mock('../../config', () => ({
  FireStore: 'mock-firestore',
}));

// Mock the validation helper
jest.mock('@/controllers/general/helpers', () => ({
  validateStatementTypeHierarchy: jest.fn(),
}));

import { validateStatementTypeHierarchy } from '@/controllers/general/helpers';

describe('changeStatementType', () => {
  const mockStatement: Statement = {
    statementId: 'test-statement-id',
    statement: 'Test statement',
    statementType: StatementType.statement,
    parentId: 'parent-id',
    creator: {
      uid: 'user-id',
      displayName: 'Test User',
      photoURL: '',
      email: 'test@example.com',
      createdAt: Date.now(),
      lastSignInTime: Date.now(),
      role: 'user',
    },
    creatorId: 'user-id',
    createdAt: Date.now(),
    lastUpdate: Date.now(),
    parents: ['parent-id'],
    topParentId: 'top-parent-id',
    hasChildren: false,
    resultsSettings: {
      resultsBy: 'consensus',
      numberOfResults: 1,
    },
    results: [],
    consensus: 0,
  } as Statement;

  beforeEach(() => {
    jest.clearAllMocks();
    // Silence expected console.error from error handling tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
    // Setup doc mock to return a mock document reference
    (doc as jest.Mock).mockReturnValue({ id: 'mock-doc-ref' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Authorization checks', () => {
    it('should return error if not authorized', async () => {
      const result = await changeStatementType(mockStatement, StatementType.option, false);

      expect(result.success).toBe(false);
      expect(result.error).toBe('You are not authorized to change this statement type');
      expect(updateDoc).not.toHaveBeenCalled();
    });

    it('should proceed if authorized', async () => {
      const mockParentDoc = {
        exists: () => true,
        data: () => ({ statementType: StatementType.statement }),
      };

      (getDoc as jest.Mock).mockResolvedValue(mockParentDoc);
      (validateStatementTypeHierarchy as jest.Mock).mockReturnValue({ allowed: true });
      (getDocs as jest.Mock).mockResolvedValue({ empty: true });
      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      const result = await changeStatementType(mockStatement, StatementType.option, true);

      expect(result.success).toBe(true);
      expect(updateDoc).toHaveBeenCalled();
    });
  });

  describe('Group type restrictions', () => {
    it('should prevent changing group type', async () => {
      const groupStatement = {
        ...mockStatement,
        statementType: StatementType.group,
      };

      const result = await changeStatementType(groupStatement, StatementType.option, true);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot change group type');
      expect(updateDoc).not.toHaveBeenCalled();
    });
  });

  describe('Parent type validation', () => {
    it('should check parent type when changing to option', async () => {
      const mockParentDoc = {
        exists: () => true,
        data: () => ({ statementType: StatementType.option }),
      };

      (getDoc as jest.Mock).mockResolvedValue(mockParentDoc);
      (validateStatementTypeHierarchy as jest.Mock).mockReturnValue({
        allowed: false,
        reason: 'Options cannot contain other options',
      });

      const result = await changeStatementType(mockStatement, StatementType.option, true);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Options cannot contain other options');
      expect(updateDoc).not.toHaveBeenCalled();
    });

    it('should allow valid parent-child combinations', async () => {
      const mockParentDoc = {
        exists: () => true,
        data: () => ({ statementType: StatementType.question }),
      };

      (getDoc as jest.Mock).mockResolvedValue(mockParentDoc);
      (validateStatementTypeHierarchy as jest.Mock).mockReturnValue({ allowed: true });
      (getDocs as jest.Mock).mockResolvedValue({ empty: true });
      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      const result = await changeStatementType(mockStatement, StatementType.option, true);

      expect(result.success).toBe(true);
      expect(validateStatementTypeHierarchy).toHaveBeenCalled();
    });

    it('should skip parent validation if parentId is "top"', async () => {
      const topLevelStatement = {
        ...mockStatement,
        parentId: 'top',
      };

      (getDocs as jest.Mock).mockResolvedValue({ empty: true });
      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      const result = await changeStatementType(topLevelStatement, StatementType.option, true);

      expect(result.success).toBe(true);
      expect(getDoc).not.toHaveBeenCalled();
    });
  });

  describe('Children validation', () => {
    it('should prevent changing to option if it has option children', async () => {
      const mockChildrenSnapshot = {
        empty: false,
      };

      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => ({ statementType: StatementType.statement }),
      });
      (validateStatementTypeHierarchy as jest.Mock).mockReturnValue({ allowed: true });
      (getDocs as jest.Mock).mockResolvedValue(mockChildrenSnapshot);

      const result = await changeStatementType(mockStatement, StatementType.option, true);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot change to option because this statement has option children');
    });

    it('should prevent changing to group if it has option children', async () => {
      const mockChildrenSnapshot = {
        empty: false,
      };

      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => ({ statementType: StatementType.statement }),
      });
      (validateStatementTypeHierarchy as jest.Mock).mockReturnValue({ allowed: true });
      (getDocs as jest.Mock).mockResolvedValue(mockChildrenSnapshot);

      const result = await changeStatementType(mockStatement, StatementType.group, true);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot change to group because this statement has option children');
    });

    it('should allow changing if no option children exist', async () => {
      const mockChildrenSnapshot = {
        empty: true,
      };

      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => ({ statementType: StatementType.statement }),
      });
      (validateStatementTypeHierarchy as jest.Mock).mockReturnValue({ allowed: true });
      (getDocs as jest.Mock).mockResolvedValue(mockChildrenSnapshot);
      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      const result = await changeStatementType(mockStatement, StatementType.option, true);

      expect(result.success).toBe(true);
    });
  });

  describe('Question type specific settings', () => {
    it('should add question settings when changing to question', async () => {
      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => ({ statementType: StatementType.statement }),
      });
      (validateStatementTypeHierarchy as jest.Mock).mockReturnValue({ allowed: true });
      (getDocs as jest.Mock).mockResolvedValue({ empty: true });

      let capturedUpdateData: Record<string, unknown> | null = null;
      (updateDoc as jest.Mock).mockImplementation((ref, data) => {
        capturedUpdateData = data;
        
return Promise.resolve();
      });

      await changeStatementType(mockStatement, StatementType.question, true);

      expect(capturedUpdateData).toEqual({
        statementType: StatementType.question,
        lastUpdate: expect.any(Number),
        questionSettings: {
          questionType: QuestionType.simple,
        },
        evaluationSettings: {
          evaluationUI: EvaluationUI.suggestions,
        },
      });
    });

    it('should not add question settings when changing to other types', async () => {
      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => ({ statementType: StatementType.statement }),
      });
      (validateStatementTypeHierarchy as jest.Mock).mockReturnValue({ allowed: true });
      (getDocs as jest.Mock).mockResolvedValue({ empty: true });

      let capturedUpdateData: Record<string, unknown> | null = null;
      (updateDoc as jest.Mock).mockImplementation((ref, data) => {
        capturedUpdateData = data;
        
return Promise.resolve();
      });

      await changeStatementType(mockStatement, StatementType.option, true);

      expect(capturedUpdateData).toEqual({
        statementType: StatementType.option,
        lastUpdate: expect.any(Number),
      });
      expect(capturedUpdateData.questionSettings).toBeUndefined();
    });
  });

  describe('Error handling', () => {
    it('should handle missing statement gracefully', async () => {
      const result = await changeStatementType(null as unknown as Statement, StatementType.option, true);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to change statement type');
    });

    it('should handle Firestore errors gracefully', async () => {
      (getDoc as jest.Mock).mockRejectedValue(new Error('Firestore error'));

      const result = await changeStatementType(mockStatement, StatementType.option, true);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to change statement type');
    });

    it('should handle update errors gracefully', async () => {
      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => ({ statementType: StatementType.statement }),
      });
      (validateStatementTypeHierarchy as jest.Mock).mockReturnValue({ allowed: true });
      (getDocs as jest.Mock).mockResolvedValue({ empty: true });
      (updateDoc as jest.Mock).mockRejectedValue(new Error('Update failed'));

      const result = await changeStatementType(mockStatement, StatementType.option, true);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to change statement type');
    });
  });

  describe('Integration scenarios', () => {
    it('should successfully change statement to option when all validations pass', async () => {
      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => ({ statementType: StatementType.question }),
      });
      (validateStatementTypeHierarchy as jest.Mock).mockReturnValue({ allowed: true });
      (getDocs as jest.Mock).mockResolvedValue({ empty: true });
      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      const result = await changeStatementType(mockStatement, StatementType.option, true);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          statementType: StatementType.option,
          lastUpdate: expect.any(Number),
        })
      );
    });

    it('should prevent invalid type changes through validation chain', async () => {
      // Try to change to option under another option
      const optionParent = {
        exists: () => true,
        data: () => ({ statementType: StatementType.option }),
      };

      (getDoc as jest.Mock).mockResolvedValue(optionParent);
      (validateStatementTypeHierarchy as jest.Mock).mockReturnValue({
        allowed: false,
        reason: 'Options cannot contain other options',
      });

      const result = await changeStatementType(mockStatement, StatementType.option, true);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Options cannot contain other options');
      expect(getDocs).not.toHaveBeenCalled(); // Should not check children if parent validation fails
      expect(updateDoc).not.toHaveBeenCalled();
    });
  });
});