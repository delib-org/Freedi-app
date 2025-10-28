import React from 'react';
import { screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router';
import RandomSuggestions from '../RandomSuggestions';
import { Statement, StatementType, Creator } from 'delib-npm';
import { renderWithProviders, getMockRootState } from '@/test-utils/test-utils';

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

// Mock the analytics hook
jest.mock('@/hooks/useMassConsensusAnalytics', () => ({
  useMassConsensusAnalytics: () => ({
    trackButtonClick: jest.fn(),
    trackStageCompleted: jest.fn(),
  }),
}));

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

const mockParentStatement = createMockStatement({ statementId: 'parent1', statementType: StatementType.question, parentId: null });

describe('RandomSuggestions Component', () => {

  const renderComponent = () => {
    const preloadedState = getMockRootState();
    
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
    expect(screen.getByText('Test Statement 1')).toBeInTheDocument();
    expect(screen.getByText('Test Statement 2')).toBeInTheDocument();
  });
});