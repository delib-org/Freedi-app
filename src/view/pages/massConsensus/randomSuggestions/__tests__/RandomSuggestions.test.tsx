import React from 'react';
import { screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router';
import RandomSuggestions from '../RandomSuggestions';
import { Statement, StatementType, Creator } from 'delib-npm';
import { renderWithProviders, getMockRootState } from '@/test-utils/test-utils';
import { StatementScreen } from '@/redux/statements/statementsSlice';

// Mock react-router
jest.mock('react-router', () => ({
  ...jest.requireActual('react-router'),
  useParams: () => ({ statementId: 'test-statement-id' }),
}));

// Mock the VM hook
jest.mock('../RandomSuggestionsVM', () => ({
  useRandomSuggestions: () => ({
    subStatements: mockSubStatements,
    navigateToTop: jest.fn(),
    loadingStatements: false,
    statement: mockParentStatement,
    fetchRandomStatements: mockFetchRandomStatements,
    canGetNewSuggestions: mockCanGetNewSuggestions,
    isLoadingNew: false,
    currentBatch: 1,
    totalBatchesViewed: 1,
  }),
}));

// Mock the header context
jest.mock('../../headerMassConsensus/HeaderContext', () => ({
  useHeader: () => ({
    setHeader: jest.fn(),
  }),
}));

// Mock the analytics hook
jest.mock('@/hooks/useMassConsensusAnalytics', () => ({
  useMassConsensusAnalytics: () => ({
    trackButtonClick: jest.fn(),
    trackStageCompleted: jest.fn(),
    trackStageSkipped: jest.fn(),
  }),
}));

// Mock the user config hook
jest.mock('@/controllers/hooks/useUserConfig', () => ({
  useUserConfig: () => ({
    userConfig: {
      fontSize: 'medium',
      language: 'en',
    },
    t: (key: string) => key,
    dir: 'ltr',
  }),
}));

// Mock the explanations context hook
jest.mock('@/contexts/massConsensus/ExplanationProvider', () => {
  const getDontShowExplanations = jest.fn(() => false);
  return {
    useExplanations: () => ({
      showExplanation: jest.fn(),
      hideExplanation: jest.fn(),
      isExplanationVisible: false,
      getStageExplanation: jest.fn(() => null),
      hasSeenExplanation: jest.fn(() => false),
      getDontShowExplanations,
    }),
    getDontShowExplanations,
  };
});

// Mock data
let mockSubStatements: Statement[] = [];
let mockCanGetNewSuggestions = false;
const mockFetchRandomStatements = jest.fn();

const createMockStatement = (overrides: Partial<Statement>): Statement => {
    const defaultCreator: Creator = { uid: 'user1', displayName: 'Test User', photoURL: '' };
    
return {
        statementId: 'stmt1',
        statement: 'Test statement',
        creatorId: 'user1',
        creator: defaultCreator,
        parentId: 'parent1',
        topParentId: 'top-parent',
        statementType: StatementType.option,
        createdAt: Date.now(),
        lastUpdate: Date.now(),
        consensus: 0,
        order: 1,
        parents: [],
        ...overrides,
    };
};

const mockParentStatement = createMockStatement({ statementId: 'test-statement-id', statementType: StatementType.question, parentId: null });

describe('RandomSuggestions Component', () => {

  const renderComponent = () => {
    const preloadedState = getMockRootState({
      statements: {
        statements: [mockParentStatement],
        statementSubscription: [],
        statementSubscriptionLastUpdate: 0,
        statementMembership: [],
        screen: StatementScreen.chat,
      },
    });

return renderWithProviders(
        <BrowserRouter>
          <RandomSuggestions />
        </BrowserRouter>,
        { preloadedState }
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSubStatements = [
      createMockStatement({ statementId: 'stmt1', statement: 'Test Statement 1' }),
      createMockStatement({ statementId: 'stmt2', statement: 'Test Statement 2' }),
    ];
    mockCanGetNewSuggestions = false;
  });

  it('should render the component with statements', () => {
    renderComponent();
    // Check that the statement cards are rendered by their IDs
    expect(document.getElementById('stmt1')).toBeInTheDocument();
    expect(document.getElementById('stmt2')).toBeInTheDocument();
    // Check that the simple-suggestions-wrapper is rendered
    expect(document.querySelector('.simple-suggestions-wrapper')).toBeInTheDocument();
  });
});