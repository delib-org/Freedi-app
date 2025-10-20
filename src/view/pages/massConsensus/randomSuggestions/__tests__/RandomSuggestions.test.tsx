import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import RandomSuggestions from '../RandomSuggestions';
import massConsensusReducer, {
  setRandomStatements,
  updateEvaluationCount,
} from '@/redux/massConsensus/massConsensusSlice';
import statementsReducer from '@/redux/statements/statementsSlice';
import evaluationsReducer from '@/redux/evaluations/evaluationsSlice';
import { Statement, StatementType } from 'delib-npm';

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

const mockParentStatement: Statement = {
  statementId: 'parent1',
  statement: 'Parent Question',
  creatorId: 'creator1',
  parentId: null,
  statementType: StatementType.question,
  createdAt: Date.now(),
  lastUpdate: Date.now(),
};

describe('RandomSuggestions Component', () => {
  let store: ReturnType<typeof configureStore>;

  const renderComponent = () => {
    return render(
      <Provider store={store}>
        <BrowserRouter>
          <RandomSuggestions />
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
        evaluations: evaluationsReducer,
      },
    });

    // Reset mock data
    mockSubStatements = [
      {
        statementId: 'stmt1',
        statement: 'Test Statement 1',
        creatorId: 'user1',
        parentId: 'parent1',
        statementType: StatementType.option,
        createdAt: Date.now(),
        lastUpdate: Date.now(),
      },
      {
        statementId: 'stmt2',
        statement: 'Test Statement 2',
        creatorId: 'user2',
        parentId: 'parent1',
        statementType: StatementType.option,
        createdAt: Date.now(),
        lastUpdate: Date.now(),
      },
    ];
    mockCanGetNewSuggestions = false;
  });

  describe('Rendering', () => {
    it('should render the component with statements', () => {
      renderComponent();

      expect(screen.getByText('Test Statement 1')).toBeInTheDocument();
      expect(screen.getByText('Test Statement 2')).toBeInTheDocument();
    });

    it('should show loading state when loading statements', () => {
      // Override the mock to show loading
      jest.requireMock('../RandomSuggestionsVM').useRandomSuggestions = () => ({
        subStatements: [],
        navigateToTop: jest.fn(),
        loadingStatements: true,
        statement: mockParentStatement,
        fetchRandomStatements: mockFetchRandomStatements,
        canGetNewSuggestions: false,
        isLoadingNew: false,
        currentBatch: 1,
        totalBatchesViewed: 1,
      });

      renderComponent();

      expect(screen.getByTestId('loader')).toBeInTheDocument();
    });

    it('should show empty state when no statements', () => {
      mockSubStatements = [];
      renderComponent();

      expect(screen.getByText(/No suggestions available/i)).toBeInTheDocument();
    });
  });

  describe('Get New Suggestions Button', () => {
    it('should disable button when not all statements are evaluated', () => {
      mockCanGetNewSuggestions = false;
      renderComponent();

      const button = screen.getByRole('button', { name: /Get New Suggestions/i });
      expect(button).toBeDisabled();
    });

    it('should enable button when all statements are evaluated', () => {
      mockCanGetNewSuggestions = true;
      renderComponent();

      const button = screen.getByRole('button', { name: /Get New Suggestions/i });
      expect(button).toBeEnabled();
    });

    it('should call fetchRandomStatements when clicked', async () => {
      mockCanGetNewSuggestions = true;
      renderComponent();

      const button = screen.getByRole('button', { name: /Get New Suggestions/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockFetchRandomStatements).toHaveBeenCalledTimes(1);
      });
    });

    it('should show batch number', () => {
      jest.requireMock('../RandomSuggestionsVM').useRandomSuggestions = () => ({
        subStatements: mockSubStatements,
        navigateToTop: jest.fn(),
        loadingStatements: false,
        statement: mockParentStatement,
        fetchRandomStatements: mockFetchRandomStatements,
        canGetNewSuggestions: false,
        isLoadingNew: false,
        currentBatch: 2,
        totalBatchesViewed: 3,
      });

      renderComponent();

      expect(screen.getByText(/Batch 3/i)).toBeInTheDocument();
    });

    it('should show loading state when fetching new suggestions', () => {
      jest.requireMock('../RandomSuggestionsVM').useRandomSuggestions = () => ({
        subStatements: mockSubStatements,
        navigateToTop: jest.fn(),
        loadingStatements: false,
        statement: mockParentStatement,
        fetchRandomStatements: mockFetchRandomStatements,
        canGetNewSuggestions: true,
        isLoadingNew: true,
        currentBatch: 1,
        totalBatchesViewed: 1,
      });

      renderComponent();

      const button = screen.getByRole('button', { name: /Get New Suggestions/i });
      expect(button).toBeDisabled();
      expect(screen.getByText(/Loading.../i)).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('should render navigation to top suggestions', () => {
      renderComponent();

      const topSuggestionsLink = screen.getByText(/Top Suggestions/i);
      expect(topSuggestionsLink).toBeInTheDocument();
    });

    it('should call navigateToTop when top suggestions is clicked', () => {
      const mockNavigateToTop = jest.fn();
      jest.requireMock('../RandomSuggestionsVM').useRandomSuggestions = () => ({
        subStatements: mockSubStatements,
        navigateToTop: mockNavigateToTop,
        loadingStatements: false,
        statement: mockParentStatement,
        fetchRandomStatements: mockFetchRandomStatements,
        canGetNewSuggestions: false,
        isLoadingNew: false,
        currentBatch: 1,
        totalBatchesViewed: 1,
      });

      renderComponent();

      const topSuggestionsLink = screen.getByText(/Top Suggestions/i);
      fireEvent.click(topSuggestionsLink);

      expect(mockNavigateToTop).toHaveBeenCalledTimes(1);
    });
  });

  describe('Evaluation Tracking', () => {
    it('should track evaluations using the hook', () => {
      renderComponent();

      // Simulate evaluation by updating Redux state
      store.dispatch(updateEvaluationCount('stmt1'));

      const state = store.getState().massConsensus;
      expect(state.ui.evaluationsPerBatch[0]).toBe(1);
    });

    it('should enable Get New button when all statements are evaluated', () => {
      renderComponent();

      // Simulate evaluating all statements
      store.dispatch(setRandomStatements(mockSubStatements));
      store.dispatch(updateEvaluationCount('stmt1'));
      store.dispatch(updateEvaluationCount('stmt2'));

      const state = store.getState().massConsensus;
      expect(state.ui.canGetNewSuggestions).toBe(true);
    });
  });

  describe('Analytics', () => {
    it('should track button clicks', () => {
      const mockTrackButtonClick = jest.fn();
      jest.requireMock('@/hooks/useMassConsensusAnalytics').useMassConsensusAnalytics = () => ({
        trackButtonClick: mockTrackButtonClick,
        trackStageCompleted: jest.fn(),
      });

      mockCanGetNewSuggestions = true;
      renderComponent();

      const button = screen.getByRole('button', { name: /Get New Suggestions/i });
      fireEvent.click(button);

      expect(mockTrackButtonClick).toHaveBeenCalledWith('get_new_suggestions');
    });

    it('should track stage completion', () => {
      const mockTrackStageCompleted = jest.fn();
      jest.requireMock('@/hooks/useMassConsensusAnalytics').useMassConsensusAnalytics = () => ({
        trackButtonClick: jest.fn(),
        trackStageCompleted: mockTrackStageCompleted,
      });

      renderComponent();

      const topSuggestionsLink = screen.getByText(/Top Suggestions/i);
      fireEvent.click(topSuggestionsLink);

      expect(mockTrackStageCompleted).toHaveBeenCalledWith('random_suggestions');
    });
  });
});