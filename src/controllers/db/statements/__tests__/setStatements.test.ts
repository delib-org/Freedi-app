// Jest test file
import { StatementType, Statement, Access, QuestionType, ParagraphType } from '@freedi/shared-types';
import { createStatement, CreateStatementProps } from '../setStatements';
import * as helpers from '@/controllers/general/helpers';

// Mock the store
jest.mock('@/redux/store', () => ({
  store: {
    getState: jest.fn(() => ({
      creator: {
        creator: {
          uid: 'test-user-id',
          displayName: 'Test User',
          photoURL: '',
          email: 'test@example.com',
          createdAt: Date.now(),
          lastSignInTime: Date.now(),
          role: 'user',
        },
      },
      statements: {
        statements: [],
      },
    })),
  },
}));

// Mock the helpers module
jest.mock('@/controllers/general/helpers', () => ({
  isStatementTypeAllowedAsChildren: jest.fn(),
  validateStatementTypeHierarchy: jest.fn(),
  TYPE_RESTRICTIONS: {
    [StatementType.option]: {
      disallowedChildren: [StatementType.option],
      reason: "Options cannot contain other options",
    },
    [StatementType.group]: {
      disallowedChildren: [StatementType.option],
      reason: "Groups cannot contain options",
    },
    [StatementType.statement]: {},
    [StatementType.question]: {},
    [StatementType.document]: {},
  },
}));

// Mock other dependencies
jest.mock('@/view/pages/statement/components/vote/statementVoteCont', () => ({
  getSiblingOptionsByParentId: jest.fn(() => []),
  getExistingOptionColors: jest.fn(() => []),
}));

jest.mock('@/view/pages/statement/components/vote/votingColors', () => ({
  getRandomColor: jest.fn(() => '#5899E0'),
}));

describe('createStatement with validation', () => {
  const mockParentStatement: Statement = {
    statementId: 'parent-id',
    statement: 'Parent Statement',
    statementType: StatementType.question,
    parentId: 'grandparent-id',
    parents: ['grandparent-id'],
    topParentId: 'top-parent-id',
    creator: {
      uid: 'parent-creator',
      displayName: 'Parent Creator',
      photoURL: '',
      email: 'parent@example.com',
      createdAt: Date.now(),
      lastSignInTime: Date.now(),
      role: 'user',
    },
    creatorId: 'parent-creator',
    createdAt: Date.now(),
    lastUpdate: Date.now(),
    hasChildren: true,
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
    (helpers.isStatementTypeAllowedAsChildren as jest.Mock).mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Basic creation', () => {
    it('should create a statement when validation passes', () => {
      const testParagraphs = [
        {
          paragraphId: 'test-p1',
          type: ParagraphType.paragraph,
          content: 'Test Description',
          order: 0,
        },
      ];

      const props: CreateStatementProps = {
        text: 'Test Statement',
        paragraphs: testParagraphs,
        parentStatement: mockParentStatement,
        statementType: StatementType.option,
      };

      const result = createStatement(props);

      expect(result).toBeDefined();
      expect(result?.statement).toBe('Test Statement');
      expect(result?.paragraphs).toEqual(testParagraphs);
      expect(result?.statementType).toBe(StatementType.option);
      expect(result?.parentId).toBe('parent-id');
    });

    it('should create a top-level statement', () => {
      const props: CreateStatementProps = {
        text: 'Top Level Statement',
        parentStatement: 'top',
        statementType: StatementType.question,
      };

      const result = createStatement(props);

      expect(result).toBeDefined();
      expect(result?.parentId).toBe('top');
      expect(result?.topParentId).toBe(result?.statementId);
    });
  });

  describe('Type validation', () => {
    it('should prevent creating option under option', () => {
      const optionParent = {
        ...mockParentStatement,
        statementType: StatementType.option,
      };

      (helpers.isStatementTypeAllowedAsChildren as jest.Mock).mockReturnValue(false);

      const props: CreateStatementProps = {
        text: 'Option under Option',
        parentStatement: optionParent,
        statementType: StatementType.option,
      };

      const result = createStatement(props);

      expect(result).toBeUndefined();
      expect(helpers.isStatementTypeAllowedAsChildren).toHaveBeenCalledWith(
        optionParent,
        StatementType.option
      );
    });

    it('should allow creating question under option', () => {
      const optionParent = {
        ...mockParentStatement,
        statementType: StatementType.option,
      };

      (helpers.isStatementTypeAllowedAsChildren as jest.Mock).mockReturnValue(true);

      const props: CreateStatementProps = {
        text: 'Question under Option',
        parentStatement: optionParent,
        statementType: StatementType.question,
      };

      const result = createStatement(props);

      expect(result).toBeDefined();
      expect(result?.statementType).toBe(StatementType.question);
    });

    it('should prevent creating option under group', () => {
      const groupParent = {
        ...mockParentStatement,
        statementType: StatementType.group,
      };

      (helpers.isStatementTypeAllowedAsChildren as jest.Mock).mockReturnValue(false);

      const props: CreateStatementProps = {
        text: 'Option under Group',
        parentStatement: groupParent,
        statementType: StatementType.option,
      };

      const result = createStatement(props);

      expect(result).toBeUndefined();
      expect(helpers.isStatementTypeAllowedAsChildren).toHaveBeenCalledWith(
        groupParent,
        StatementType.option
      );
    });

    it('should allow creating statement under any parent type', () => {
      const testCases = [
        StatementType.option,
        StatementType.group,
        StatementType.question,
        StatementType.document,
        StatementType.statement,
      ];

      testCases.forEach(parentType => {
        const parent = {
          ...mockParentStatement,
          statementType: parentType,
        };

        (helpers.isStatementTypeAllowedAsChildren as jest.Mock).mockReturnValue(true);

        const props: CreateStatementProps = {
          text: `Statement under ${parentType}`,
          parentStatement: parent,
          statementType: StatementType.statement,
        };

        const result = createStatement(props);

        expect(result).toBeDefined();
        expect(result?.statementType).toBe(StatementType.statement);
      });
    });
  });

  describe('Default values and settings', () => {
    it('should set default membership to openToAll when not provided', () => {
      const props: CreateStatementProps = {
        text: 'Statement without membership',
        parentStatement: mockParentStatement,
        statementType: StatementType.statement,
      };

      const result = createStatement(props);

      expect(result?.membership).toEqual({ access: Access.openToAll });
    });

    it('should use provided membership when specified', () => {
      const customMembership = { access: Access.moderated };

      const props: CreateStatementProps = {
        text: 'Statement with custom membership',
        parentStatement: mockParentStatement,
        statementType: StatementType.statement,
        membership: customMembership,
      };

      const result = createStatement(props);

      expect(result?.membership).toEqual(customMembership);
    });

    it('should set question-specific settings for question type', () => {
      const props: CreateStatementProps = {
        text: 'Question Statement',
        parentStatement: mockParentStatement,
        statementType: StatementType.question,
        questionType: QuestionType.multiStage,
      };

      const result = createStatement(props);

      expect(result?.questionSettings).toBeDefined();
      expect(result?.questionSettings?.questionType).toBe(QuestionType.multiStage);
      expect(result?.evaluationSettings).toBeDefined();
    });

    it('should inherit parent hierarchy correctly', () => {
      const props: CreateStatementProps = {
        text: 'Child Statement',
        parentStatement: mockParentStatement,
        statementType: StatementType.statement,
      };

      const result = createStatement(props);

      expect(result?.parentId).toBe('parent-id');
      expect(result?.parents).toContain('parent-id');
      expect(result?.parents).toContain('grandparent-id');
      expect(result?.topParentId).toBe('top-parent-id');
    });
  });

  describe('Error handling', () => {
    it('should return undefined when creator is not found', async () => {
      jest.spyOn((await import('@/redux/store')).store, 'getState').mockReturnValueOnce({
        creator: { creator: null },
        statements: {
          statements: [],
          statementSubscription: [],
          statementSubscriptionLastUpdate: 0,
          statementMembership: [],
          screen: 'none'
        },
      } as unknown as ReturnType<typeof import('@/redux/store').store.getState>);

      const props: CreateStatementProps = {
        text: 'Statement without creator',
        parentStatement: mockParentStatement,
        statementType: StatementType.statement,
      };

      const result = createStatement(props);

      expect(result).toBeUndefined();
    });

    it('should return undefined when text is empty', () => {
      const props: CreateStatementProps = {
        text: '',
        parentStatement: mockParentStatement,
        statementType: StatementType.statement,
      };

      const result = createStatement(props);

      expect(result).toBeUndefined();
    });

    it('should return undefined when statementType is not provided', () => {
      const props: CreateStatementProps = {
        text: 'Statement without type',
        parentStatement: mockParentStatement,
        statementType: undefined as unknown as StatementType,
      };

      const result = createStatement(props);

      expect(result).toBeUndefined();
    });
  });

  describe('Mass consensus handling', () => {
    it('should handle mass consensus question type', () => {
      const props: CreateStatementProps = {
        text: 'Mass Consensus Question',
        parentStatement: mockParentStatement,
        statementType: StatementType.question,
        questionType: QuestionType.massConsensus,
      };

      const result = createStatement(props);

      expect(result?.hasChildren).toBe(false);
      expect(result?.defaultLanguage).toBeDefined();
    });
  });

  describe('Integration with validation', () => {
    it('should respect validation for all statement type combinations', () => {
      const typeMatrix = [
        { parent: StatementType.option, child: StatementType.option, allowed: false },
        { parent: StatementType.option, child: StatementType.question, allowed: true },
        { parent: StatementType.group, child: StatementType.option, allowed: false },
        { parent: StatementType.group, child: StatementType.question, allowed: true },
        { parent: StatementType.question, child: StatementType.option, allowed: true },
      ];

      typeMatrix.forEach(({ parent, child, allowed }) => {
        const parentStatement = {
          ...mockParentStatement,
          statementType: parent,
        };

        (helpers.isStatementTypeAllowedAsChildren as jest.Mock).mockReturnValue(allowed);

        const props: CreateStatementProps = {
          text: `Test ${child} under ${parent}`,
          parentStatement,
          statementType: child,
        };

        const result = createStatement(props);

        if (allowed) {
          expect(result).toBeDefined();
          expect(result?.statementType).toBe(child);
        } else {
          expect(result).toBeUndefined();
        }
      });
    });
  });
});