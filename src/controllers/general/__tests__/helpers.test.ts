import { StatementType, Statement } from 'delib-npm';
import {
  isStatementTypeAllowedAsChildren,
  validateStatementTypeHierarchy,
  TYPE_RESTRICTIONS
} from '../helpers';

describe('Statement Type Validation', () => {
  beforeEach(() => {
    // Clear console mocks before each test
    jest.clearAllMocks();
  });

  describe('TYPE_RESTRICTIONS configuration', () => {
    it('should have restrictions defined for option type', () => {
      expect(TYPE_RESTRICTIONS[StatementType.option]).toBeDefined();
      expect(TYPE_RESTRICTIONS[StatementType.option].disallowedChildren).toContain(StatementType.option);
    });

    it('should have restrictions defined for group type', () => {
      expect(TYPE_RESTRICTIONS[StatementType.group]).toBeDefined();
      expect(TYPE_RESTRICTIONS[StatementType.group].disallowedChildren).toContain(StatementType.option);
    });

    it('should have reason messages for restrictions', () => {
      expect(TYPE_RESTRICTIONS[StatementType.option].reason).toBe("Options cannot contain other options");
      expect(TYPE_RESTRICTIONS[StatementType.group].reason).toBe("Groups cannot contain options");
    });
  });

  describe('isStatementTypeAllowedAsChildren', () => {
    const consoleSpy = jest.spyOn(console, 'info').mockImplementation(() => {});

    it('should allow any type under "top"', () => {
      expect(isStatementTypeAllowedAsChildren('top', StatementType.option)).toBe(true);
      expect(isStatementTypeAllowedAsChildren('top', StatementType.question)).toBe(true);
      expect(isStatementTypeAllowedAsChildren('top', StatementType.statement)).toBe(true);
    });

    it('should allow any type under string parent (legacy support)', () => {
      expect(isStatementTypeAllowedAsChildren('some-id', StatementType.option)).toBe(true);
      expect(isStatementTypeAllowedAsChildren('some-id', StatementType.question)).toBe(true);
    });

    it('should prevent options under options', () => {
      const optionParent = { statementType: StatementType.option };

      expect(isStatementTypeAllowedAsChildren(optionParent, StatementType.option)).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cannot create option under option')
      );
    });

    it('should allow questions under options', () => {
      const optionParent = { statementType: StatementType.option };

      expect(isStatementTypeAllowedAsChildren(optionParent, StatementType.question)).toBe(true);
      expect(isStatementTypeAllowedAsChildren(optionParent, StatementType.statement)).toBe(true);
    });

    it('should prevent options under groups', () => {
      const groupParent = { statementType: StatementType.group };

      expect(isStatementTypeAllowedAsChildren(groupParent, StatementType.option)).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cannot create option under group')
      );
    });

    it('should allow other types under groups', () => {
      const groupParent = { statementType: StatementType.group };

      expect(isStatementTypeAllowedAsChildren(groupParent, StatementType.question)).toBe(true);
      expect(isStatementTypeAllowedAsChildren(groupParent, StatementType.statement)).toBe(true);
      expect(isStatementTypeAllowedAsChildren(groupParent, StatementType.document)).toBe(true);
    });

    it('should allow all types under statements', () => {
      const statementParent = { statementType: StatementType.statement };

      expect(isStatementTypeAllowedAsChildren(statementParent, StatementType.option)).toBe(true);
      expect(isStatementTypeAllowedAsChildren(statementParent, StatementType.question)).toBe(true);
      expect(isStatementTypeAllowedAsChildren(statementParent, StatementType.statement)).toBe(true);
    });

    it('should allow all types under questions', () => {
      const questionParent = { statementType: StatementType.question };

      expect(isStatementTypeAllowedAsChildren(questionParent, StatementType.option)).toBe(true);
      expect(isStatementTypeAllowedAsChildren(questionParent, StatementType.question)).toBe(true);
      expect(isStatementTypeAllowedAsChildren(questionParent, StatementType.statement)).toBe(true);
    });
  });

  describe('validateStatementTypeHierarchy', () => {
    it('should return allowed:true for valid combinations', () => {
      const questionParent = { statementType: StatementType.question };

      const result = validateStatementTypeHierarchy(questionParent, StatementType.option);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should return allowed:false with reason for option under option', () => {
      const optionParent = { statementType: StatementType.option };

      const result = validateStatementTypeHierarchy(optionParent, StatementType.option);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Options cannot contain other options");
    });

    it('should return allowed:false with reason for option under group', () => {
      const groupParent = { statementType: StatementType.group };

      const result = validateStatementTypeHierarchy(groupParent, StatementType.option);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Groups cannot contain options");
    });

    it('should return allowed:true for top parent', () => {
      const result = validateStatementTypeHierarchy('top', StatementType.option);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should return allowed:true for string parent (legacy)', () => {
      const result = validateStatementTypeHierarchy('some-parent-id', StatementType.option);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should handle all statement types correctly', () => {
      const testCases = [
        { parent: StatementType.option, child: StatementType.option, expected: false },
        { parent: StatementType.option, child: StatementType.question, expected: true },
        { parent: StatementType.option, child: StatementType.statement, expected: true },
        { parent: StatementType.group, child: StatementType.option, expected: false },
        { parent: StatementType.group, child: StatementType.question, expected: true },
        { parent: StatementType.statement, child: StatementType.option, expected: true },
        { parent: StatementType.question, child: StatementType.option, expected: true },
        { parent: StatementType.document, child: StatementType.option, expected: true },
      ];

      testCases.forEach(({ parent, child, expected }) => {
        const parentObj = { statementType: parent };
        const result = validateStatementTypeHierarchy(parentObj, child);
        expect(result.allowed).toBe(expected);
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle undefined parent gracefully', () => {
      // This would be caught by TypeScript, but testing runtime behavior
      const undefinedParent = undefined as unknown as Statement;
      expect(() => isStatementTypeAllowedAsChildren(undefinedParent, StatementType.option)).not.toThrow();
    });

    it('should handle null parent gracefully', () => {
      const nullParent = null as unknown as Statement;
      expect(() => isStatementTypeAllowedAsChildren(nullParent, StatementType.option)).not.toThrow();
    });

    it('should handle parent without statementType property', () => {
      const invalidParent = { someOtherProp: 'value' } as unknown as Statement;
      const result = validateStatementTypeHierarchy(invalidParent, StatementType.option);
      // Should default to allowing since restrictions wouldn't apply
      expect(result.allowed).toBe(true);
    });
  });
});