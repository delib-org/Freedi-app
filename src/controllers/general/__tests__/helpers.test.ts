// Mock @freedi/shared-types before import to prevent valibot loading
jest.mock('@freedi/shared-types', () => ({
	StatementType: {
		statement: 'statement',
		option: 'option',
		question: 'question',
		document: 'document',
		group: 'group',
		comment: 'comment',
	},
	Role: {
		admin: 'admin',
		member: 'member',
		waiting: 'waiting',
		banned: 'banned',
	},
	QuestionType: {
		multipleChoice: 'multipleChoice',
		openEnded: 'openEnded',
	},
}));

// Define types locally
enum StatementType {
	statement = 'statement',
	option = 'option',
	question = 'question',
	document = 'document',
	group = 'group',
	comment = 'comment',
}

enum Role {
	admin = 'admin',
	member = 'member',
	waiting = 'waiting',
	banned = 'banned',
}

enum QuestionType {
	multipleChoice = 'multipleChoice',
	openEnded = 'openEnded',
}

interface Creator {
	uid: string;
	displayName: string;
	email?: string;
}

interface Statement {
	statementId: string;
	parentId: string;
	topParentId: string;
	statement: string;
	statementType: StatementType;
	creator: Creator;
	creatorId: string;
	createdAt: number;
	lastUpdate: number;
	lastChildUpdate?: number;
	consensus: number;
	parents: string[];
	results: unknown[];
	resultsSettings: {
		resultsBy: string;
		numberOfResults: number;
		cutoffBy: string;
	};
	description?: string;
	questionType?: QuestionType;
}

import {
  isStatementTypeAllowedAsChildren,
  validateStatementTypeHierarchy,
  TYPE_RESTRICTIONS,
  isAdmin,
  isChatMessage,
  isMassConsensus,
  getInitials,
  getRandomColor,
  statementTitleToDisplay,
  getTitle,
  getDescription,
  getFirstName,
  getNumberDigits,
  truncateString,
  getLatestUpdateStatements,
  emojiTransformer,
  calculateFontSize,
  getSetTimerId,
  getRoomTimerId,
  getStatementSubscriptionId,
  getLastElements,
  isProduction,
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

describe('Role and Type Helpers', () => {
  describe('isAdmin', () => {
    it('should return true for admin role', () => {
      expect(isAdmin(Role.admin)).toBe(true);
    });

    it('should return true for creator role', () => {
      expect(isAdmin(Role.creator)).toBe(true);
    });

    it('should return false for member role', () => {
      expect(isAdmin(Role.member)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isAdmin(undefined)).toBe(false);
    });
  });

  describe('isChatMessage', () => {
    it('should return true for statement type', () => {
      expect(isChatMessage(StatementType.statement)).toBe(true);
    });

    it('should return false for option type', () => {
      expect(isChatMessage(StatementType.option)).toBe(false);
    });

    it('should return false for question type', () => {
      expect(isChatMessage(StatementType.question)).toBe(false);
    });
  });

  describe('isMassConsensus', () => {
    it('should return true for massConsensus type', () => {
      expect(isMassConsensus(QuestionType.massConsensus)).toBe(true);
    });

    it('should return false for simple type', () => {
      expect(isMassConsensus(QuestionType.simple)).toBe(false);
    });
  });
});

describe('String Manipulation Helpers', () => {
  describe('getInitials', () => {
    it('should return initials for full name', () => {
      expect(getInitials('John Doe')).toBe('JD');
    });

    it('should handle single name', () => {
      expect(getInitials('John')).toBe('J');
    });

    it('should handle multiple names', () => {
      expect(getInitials('John Michael Doe')).toBe('JMD');
    });

    it('should handle lowercase names', () => {
      expect(getInitials('john doe')).toBe('JD');
    });

    it('should handle empty string', () => {
      expect(getInitials('')).toBe('');
    });
  });

  describe('getFirstName', () => {
    it('should return first name with initial from full name', () => {
      expect(getFirstName('John Doe')).toBe('John D.');
    });

    it('should return just first name for single name', () => {
      expect(getFirstName('John')).toBe('John');
    });

    it('should handle empty string', () => {
      expect(getFirstName('')).toBe('');
    });
  });

  describe('truncateString', () => {
    it('should truncate long strings', () => {
      expect(truncateString('This is a very long string that needs truncation', 20)).toBe('This is a very long ...');
    });

    it('should not truncate short strings', () => {
      expect(truncateString('Short', 20)).toBe('Short');
    });

    it('should use default max length of 20', () => {
      expect(truncateString('This is exactly twenty char!')).toBe('This is exactly twen...');
    });
  });

  describe('statementTitleToDisplay', () => {
    it('should truncate title if too long', () => {
      const result = statementTitleToDisplay('This is a very long title', 10);
      expect(result.shortVersion).toBe('This is a ...');
    });

    it('should return full title if short enough', () => {
      const result = statementTitleToDisplay('Short', 20);
      expect(result.shortVersion).toBe('Short');
      expect(result.fullVersion).toBe('Short');
    });

    it('should extract first line from multiline', () => {
      const result = statementTitleToDisplay('First Line\nSecond Line', 50);
      expect(result.fullVersion).toBe('First Line');
    });

    it('should remove asterisks', () => {
      const result = statementTitleToDisplay('*Title*', 50);
      expect(result.fullVersion).toBe('Title');
    });
  });

  describe('getTitle', () => {
    it('should return first line of statement', () => {
      const statement = { statement: 'Title\nDescription here' } as Statement;
      expect(getTitle(statement)).toBe('Title');
    });

    it('should remove asterisks', () => {
      const statement = { statement: '*Bold Title*' } as Statement;
      expect(getTitle(statement)).toBe('Bold Title');
    });

    it('should return empty string for undefined', () => {
      expect(getTitle(undefined)).toBe('');
    });
  });

  describe('getDescription', () => {
    it('should return everything after first line', () => {
      const statement = { statement: 'Title\nLine 1\nLine 2' } as Statement;
      expect(getDescription(statement)).toBe('Line 1\nLine 2');
    });

    it('should return empty for single line', () => {
      const statement = { statement: 'Just a title' } as Statement;
      expect(getDescription(statement)).toBe('');
    });
  });
});

describe('Number Helpers', () => {
  describe('getNumberDigits', () => {
    it('should return correct digit count for positive numbers', () => {
      expect(getNumberDigits(1)).toBe(1);
      expect(getNumberDigits(10)).toBe(2);
      expect(getNumberDigits(100)).toBe(3);
      expect(getNumberDigits(1000)).toBe(4);
    });

    it('should handle decimal numbers by flooring', () => {
      expect(getNumberDigits(99.9)).toBe(2);
      expect(getNumberDigits(9.5)).toBe(1);
    });
  });

  describe('calculateFontSize', () => {
    it('should return smaller font for longer text', () => {
      const shortFont = calculateFontSize('Short', 6, 14);
      const longFont = calculateFontSize('This is a very long text string', 6, 14);

      const shortSize = parseFloat(shortFont);
      const longSize = parseFloat(longFont);

      expect(shortSize).toBeGreaterThan(longSize);
    });

    it('should not go below min size', () => {
      const result = calculateFontSize('A'.repeat(100), 6, 14);
      expect(parseFloat(result)).toBe(6);
    });
  });
});

describe('ID Generation Helpers', () => {
  describe('getSetTimerId', () => {
    it('should create timer ID from statement and order', () => {
      expect(getSetTimerId('stmt-123', 1)).toBe('stmt-123--1');
    });
  });

  describe('getRoomTimerId', () => {
    it('should create room timer ID', () => {
      expect(getRoomTimerId('stmt-123', 2, 3)).toBe('stmt-123--2--3');
    });
  });

  describe('getStatementSubscriptionId', () => {
    it('should create subscription ID from user and statement', () => {
      expect(getStatementSubscriptionId('stmt-123', 'user-456')).toBe('user-456--stmt-123');
    });

    it('should return undefined for missing statementId', () => {
      expect(getStatementSubscriptionId('', 'user-456')).toBeUndefined();
    });
  });

  describe('getRandomColor', () => {
    it('should return a valid hex color', () => {
      const color = getRandomColor();
      expect(color).toMatch(/^#[0-9A-F]{6}$/);
    });

    it('should generate different colors on multiple calls', () => {
      const colors = new Set([
        getRandomColor(),
        getRandomColor(),
        getRandomColor(),
        getRandomColor(),
        getRandomColor(),
      ]);
      // With randomness, we should get at least 2 different colors
      expect(colors.size).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('Array Helpers', () => {
  describe('getLastElements', () => {
    it('should return last N elements', () => {
      const arr = [1, 2, 3, 4, 5];
      expect(getLastElements(arr, 3)).toEqual([3, 4, 5]);
    });

    it('should return from index 1 if array is smaller', () => {
      const arr = [1, 2];
      expect(getLastElements(arr, 5)).toEqual([2]);
    });
  });

  describe('getLatestUpdateStatements', () => {
    it('should return the latest lastUpdate value', () => {
      const statements = [
        { lastUpdate: 100 },
        { lastUpdate: 300 },
        { lastUpdate: 200 },
      ] as Statement[];
      expect(getLatestUpdateStatements(statements)).toBe(300);
    });

    it('should return 0 for empty array', () => {
      expect(getLatestUpdateStatements([])).toBe(0);
    });

    it('should return 0 for undefined', () => {
      expect(getLatestUpdateStatements(undefined as unknown as Statement[])).toBe(0);
    });
  });
});

describe('Emoji Transformer', () => {
  describe('emojiTransformer', () => {
    it('should transform sentiment codes to emojis', () => {
      expect(emojiTransformer(':1')).toContain('😁');
      expect(emojiTransformer(':-1')).toContain('😠');
      expect(emojiTransformer(':0')).toContain('😐');
    });

    it('should handle empty string', () => {
      expect(emojiTransformer('')).toBe('');
    });

    it('should handle text without sentiment codes', () => {
      expect(emojiTransformer('Hello world')).toBe('Hello world');
    });

    it('should preserve surrounding text', () => {
      const result = emojiTransformer('I feel :1 about this');
      expect(result).toContain('😁');
      expect(result).toContain('I feel');
      expect(result).toContain('about this');
    });
  });
});

describe('isProduction', () => {
  it('should return false in test environment', () => {
    expect(isProduction()).toBe(false);
  });
});