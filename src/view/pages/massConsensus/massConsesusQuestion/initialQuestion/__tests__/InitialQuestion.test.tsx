import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router';
import InitialQuestion from '../InitialQuestion';
import { Statement, StatementType, Role, Creator } from 'delib-npm';
import { renderWithProviders, getMockRootState } from '@/test-utils/test-utils';
import { StatementScreen } from '@/redux/statements/statementsSlice';

// Mocks
jest.mock('../InitialQuestionVM', () => ({
  useInitialQuestion: () => ({
    handleSetInitialSuggestion: mockHandleSetInitialSuggestion,
    ifButtonEnabled: mockIfButtonEnabled,
    ready: false,
    error: mockError,
    subscription: mockSubscription,
  }),
}));
jest.mock('react-router', () => ({
  ...jest.requireActual('react-router'),
  useParams: () => ({ statementId: 'test-statement-id' }),
}));
jest.mock('@/controllers/hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/controllers/db/statements/setStatements', () => ({
  updateStatementText: jest.fn(),
}));

const mockPrefetchRandomBatches = jest.fn();
const mockPrefetchTopStatements = jest.fn();

jest.mock('@/redux/massConsensus/massConsensusSlice', () => ({
    ...jest.requireActual('@/redux/massConsensus/massConsensusSlice'),
    prefetchRandomBatches: () => mockPrefetchRandomBatches(),
    prefetchTopStatements: () => mockPrefetchTopStatements(),
}));

// Mock data
const mockHandleSetInitialSuggestion = jest.fn();
let mockIfButtonEnabled = false;
let mockError: { blocking: boolean; message: string } | undefined = undefined;
const mockSubscription = { role: Role.member };

const createMockStatement = (overrides: Partial<Statement>): Statement => {
    const defaultCreator: Creator = { uid: 'creator1', displayName: 'Creator', photoURL: '' };
    
return {
        statementId: 'test-statement-id',
        statement: 'Test Question',
        creatorId: 'creator1',
        creator: defaultCreator,
        parentId: null,
        topParentId: 'test-statement-id',
        statementType: StatementType.question,
        createdAt: Date.now(),
        lastUpdate: Date.now(),
        consensus: 1,
        order: 1,
        parents: [],
        ...overrides,
    };
};

const mockStatement = createMockStatement({});

describe('InitialQuestion Component', () => {

  const renderComponent = (props = {}) => {
    const defaultProps = {
      stage: 'question',
      setStage: jest.fn(),
      setIfButtonEnabled: jest.fn(),
      setReachedLimit: jest.fn(),
    };

    const preloadedState = getMockRootState({
        statements: {
            statements: [mockStatement],
            statementSubscription: [],
            statementSubscriptionLastUpdate: 0,
            statementMembership: [],
            screen: StatementScreen.chat,
        },
    });

    return renderWithProviders(
        <BrowserRouter>
          <InitialQuestion {...defaultProps} {...props} />
        </BrowserRouter>,
        { preloadedState }
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIfButtonEnabled = false;
    mockError = undefined;
  });

  it('should trigger prefetch when typing more than 10 characters', async () => {
    const { store } = renderComponent();
    const dispatchSpy = jest.spyOn(store, 'dispatch');

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'This is a longer suggestion text' } });

    await waitFor(() => {
      expect(dispatchSpy).toHaveBeenCalledWith(mockPrefetchRandomBatches());
      expect(dispatchSpy).toHaveBeenCalledWith(mockPrefetchTopStatements());
    });
  });
});