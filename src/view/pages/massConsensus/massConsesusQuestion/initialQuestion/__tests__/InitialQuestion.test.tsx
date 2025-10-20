import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import InitialQuestion from '../InitialQuestion';
import massConsensusReducer, {
  prefetchRandomBatches,
  prefetchTopStatements,
} from '@/redux/massConsensus/massConsensusSlice';
import statementsReducer from '@/redux/statements/statementsSlice';
import { Statement, StatementType, Role } from 'delib-npm';

// Mock the VM hook
jest.mock('../InitialQuestionVM', () => ({
  useInitialQuestion: () => ({
    handleSetInitialSuggestion: mockHandleSetInitialSuggestion,
    ifButtonEnabled: mockIfButtonEnabled,
    ready: false,
    error: mockError,
    subscription: mockSubscription,
  }),
}));

// Mock the useParams hook
jest.mock('react-router', () => ({
  ...jest.requireActual('react-router'),
  useParams: () => ({ statementId: 'test-statement-id' }),
}));

// Mock the useUserConfig hook
jest.mock('@/controllers/hooks/useUserConfig', () => ({
  useUserConfig: () => ({
    t: (key: string) => key, // Simple passthrough for testing
  }),
}));

// Mock the updateStatementText function
jest.mock('@/controllers/db/statements/setStatements', () => ({
  updateStatementText: jest.fn(),
}));

// Mock the prefetch actions
jest.mock('@/redux/massConsensus/massConsensusSlice', () => ({
  ...jest.requireActual('@/redux/massConsensus/massConsensusSlice'),
  prefetchRandomBatches: jest.fn((params) => ({
    type: 'massConsensus/prefetchRandomBatches',
    payload: params,
  })),
  prefetchTopStatements: jest.fn((statementId) => ({
    type: 'massConsensus/prefetchTopStatements',
    payload: statementId,
  })),
}));

// Mock data
const mockHandleSetInitialSuggestion = jest.fn();
let mockIfButtonEnabled = false;
let mockError: { blocking: boolean; message: string } | undefined = undefined;
const mockSubscription = { role: Role.user };

const mockStatement: Statement = {
  statementId: 'test-statement-id',
  statement: 'Test Question',
  creatorId: 'creator1',
  parentId: null,
  statementType: StatementType.question,
  createdAt: Date.now(),
  lastUpdate: Date.now(),
};

describe('InitialQuestion Component - Prefetching', () => {
  let store: ReturnType<typeof configureStore>;

  const renderComponent = (props = {}) => {
    const defaultProps = {
      stage: 'question',
      setStage: jest.fn(),
      setIfButtonEnabled: jest.fn(),
      setReachedLimit: jest.fn(),
    };

    return render(
      <Provider store={store}>
        <BrowserRouter>
          <InitialQuestion {...defaultProps} {...props} />
        </BrowserRouter>
      </Provider>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();

    store = configureStore({
      reducer: {
        massConsensus: massConsensusReducer,
        statements: statementsReducer,
      },
      preloadedState: {
        statements: {
          statements: [mockStatement],
          statementSubscription: [],
        },
      },
    });

    // Reset mock data
    mockIfButtonEnabled = false;
    mockError = undefined;
  });

  describe('Prefetching Triggers', () => {
    it('should NOT trigger prefetch when typing less than 10 characters', () => {
      renderComponent();

      const textarea = screen.getByRole('textbox', { name: /Your suggestion/i });
      fireEvent.change(textarea, { target: { value: 'Short' } });

      expect(prefetchRandomBatches).not.toHaveBeenCalled();
      expect(prefetchTopStatements).not.toHaveBeenCalled();
    });

    it('should trigger prefetch when typing more than 10 characters', async () => {
      renderComponent();

      const textarea = screen.getByRole('textbox', { name: /Your suggestion/i });
      fireEvent.change(textarea, { target: { value: 'This is a longer suggestion text' } });

      await waitFor(() => {
        expect(prefetchRandomBatches).toHaveBeenCalledWith({
          statementId: 'test-statement-id',
          batchCount: 3,
        });
        expect(prefetchTopStatements).toHaveBeenCalledWith('test-statement-id');
      });
    });

    it('should only trigger prefetch once per session', async () => {
      renderComponent();

      const textarea = screen.getByRole('textbox', { name: /Your suggestion/i });

      // First time typing more than 10 characters
      fireEvent.change(textarea, { target: { value: 'First long suggestion text' } });

      await waitFor(() => {
        expect(prefetchRandomBatches).toHaveBeenCalledTimes(1);
        expect(prefetchTopStatements).toHaveBeenCalledTimes(1);
      });

      // Clear the text and type again
      fireEvent.change(textarea, { target: { value: '' } });
      fireEvent.change(textarea, { target: { value: 'Second long suggestion text' } });

      // Should not trigger prefetch again
      await waitFor(() => {
        expect(prefetchRandomBatches).toHaveBeenCalledTimes(1);
        expect(prefetchTopStatements).toHaveBeenCalledTimes(1);
      });
    });

    it('should not trigger prefetch without a statementId', () => {
      // Override useParams to return undefined
      jest.spyOn(require('react-router'), 'useParams').mockReturnValue({ statementId: undefined });

      renderComponent();

      const textarea = screen.getByRole('textbox', { name: /Your suggestion/i });
      fireEvent.change(textarea, { target: { value: 'This is a longer suggestion text' } });

      expect(prefetchRandomBatches).not.toHaveBeenCalled();
      expect(prefetchTopStatements).not.toHaveBeenCalled();
    });

    it('should dispatch prefetch actions to the store', async () => {
      const dispatchSpy = jest.spyOn(store, 'dispatch');

      renderComponent();

      const textarea = screen.getByRole('textbox', { name: /Your suggestion/i });
      fireEvent.change(textarea, { target: { value: 'This triggers prefetching now' } });

      await waitFor(() => {
        expect(dispatchSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'massConsensus/prefetchRandomBatches',
            payload: {
              statementId: 'test-statement-id',
              batchCount: 3,
            },
          })
        );
        expect(dispatchSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'massConsensus/prefetchTopStatements',
            payload: 'test-statement-id',
          })
        );
      });
    });
  });

  describe('Component Behavior', () => {
    it('should update button enabled state based on description', () => {
      const setIfButtonEnabled = jest.fn();
      renderComponent({ setIfButtonEnabled });

      const textarea = screen.getByRole('textbox', { name: /Your suggestion/i });

      // Empty text
      fireEvent.change(textarea, { target: { value: '' } });
      expect(setIfButtonEnabled).toHaveBeenCalledWith(false);

      // With text
      fireEvent.change(textarea, { target: { value: 'Some text' } });
      expect(setIfButtonEnabled).toHaveBeenCalledWith(true);
    });

    it('should handle submission on Enter key', () => {
      mockIfButtonEnabled = true;
      renderComponent();

      const textarea = screen.getByRole('textbox', { name: /Your suggestion/i });
      fireEvent.keyUp(textarea, { key: 'Enter' });

      expect(mockHandleSetInitialSuggestion).toHaveBeenCalled();
    });

    it('should show error message when error exists', () => {
      mockError = { blocking: false, message: 'test_error_message' };
      renderComponent();

      expect(screen.getByText('test_error_message')).toBeInTheDocument();
    });

    it('should disable textarea when stage is submitting', () => {
      renderComponent({ stage: 'submitting' });

      const textarea = screen.getByRole('textbox', { name: /Your suggestion/i });
      expect(textarea).toBeDisabled();
    });

    it('should disable textarea when error is blocking', () => {
      mockError = { blocking: true, message: 'Blocking error' };
      renderComponent();

      const textarea = screen.getByRole('textbox', { name: /Your suggestion/i });
      expect(textarea).toBeDisabled();
    });
  });

  describe('Integration with Redux', () => {
    it('should properly integrate prefetching with Redux state', async () => {
      renderComponent();

      const textarea = screen.getByRole('textbox', { name: /Your suggestion/i });
      fireEvent.change(textarea, { target: { value: 'Long enough text to trigger prefetch' } });

      await waitFor(() => {
        // Check that the actions were called
        expect(prefetchRandomBatches).toHaveBeenCalled();
        expect(prefetchTopStatements).toHaveBeenCalled();
      });

      // The actual Redux state update would happen if the thunk was real
      // In a real test, you'd check that the prefetch state is updated
    });
  });
});