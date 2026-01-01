/**
 * Tests for SurveyQuestionWrapper component
 * @jest-environment jsdom
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SurveyQuestionWrapper from '../SurveyQuestionWrapper';
import { SurveyWithQuestions } from '@/types/survey';
import { MergedQuestionSettings } from '@/lib/utils/settingsUtils';

// Mock next/navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

// Mock SurveyProgressBar
jest.mock('../SurveyProgress', () => ({
  __esModule: true,
  default: ({ currentIndex, totalQuestions }: { currentIndex: number; totalQuestions: number }) => (
    <div data-testid="survey-progress">
      Progress: {currentIndex + 1}/{totalQuestions}
    </div>
  ),
}));

// Mock SurveyNavigation
jest.mock('../SurveyNavigation', () => ({
  __esModule: true,
  default: ({
    onNavigate,
    showAddSuggestion,
    showViewProgress,
    onAddSuggestion,
    onViewProgress,
    evaluatedCount,
    availableOptionsCount,
  }: {
    onNavigate: (direction: 'back' | 'next') => void;
    showAddSuggestion?: boolean;
    showViewProgress?: boolean;
    onAddSuggestion?: () => void;
    onViewProgress?: () => void;
    evaluatedCount: number;
    availableOptionsCount: number;
  }) => (
    <div data-testid="survey-navigation">
      <button onClick={() => onNavigate('back')}>Back</button>
      <button onClick={() => onNavigate('next')}>Next</button>
      {showAddSuggestion && (
        <button onClick={onAddSuggestion} data-testid="add-suggestion">
          Add Suggestion
        </button>
      )}
      {showViewProgress && (
        <button onClick={onViewProgress} data-testid="view-progress">
          View Progress
        </button>
      )}
      <span data-testid="evaluated-count">{evaluatedCount}</span>
      <span data-testid="solutions-count">{availableOptionsCount}</span>
    </div>
  ),
}));

describe('SurveyQuestionWrapper', () => {
  const defaultSettings: MergedQuestionSettings = {
    allowSkipping: false,
    minEvaluationsPerQuestion: 3,
    maxEvaluationsPerQuestion: 10,
    showSolutions: true,
    allowAddingSolutions: true,
    showResults: false,
    shuffleSolutions: false,
    allowParticipantsToAddSuggestions: true,
    askUserForASolutionBeforeEvaluation: false,
  };

  const createMockSurvey = (): SurveyWithQuestions => ({
    surveyId: 'survey-123',
    title: 'Test Survey',
    creatorId: 'creator-123',
    questionIds: ['q1', 'q2'],
    settings: {
      allowAnonymous: true,
      shuffleQuestions: false,
      showProgress: true,
      allowReturning: true,
    },
    questionSettings: {},
    status: 'active',
    createdAt: Date.now(),
    lastUpdate: Date.now(),
    questions: [
      {
        statementId: 'q1',
        statement: 'Question 1',
        parentId: '',
        creatorId: '',
        lastUpdate: Date.now(),
        createdAt: Date.now(),
        statementType: 'question',
        consensus: 0,
        evaluation: { sumEvaluations: 0, numberOfEvaluations: 0, sumPro: 0, sumCon: 0 },
        numberOfOptions: 5,
      },
      {
        statementId: 'q2',
        statement: 'Question 2',
        parentId: '',
        creatorId: '',
        lastUpdate: Date.now(),
        createdAt: Date.now(),
        statementType: 'question',
        consensus: 0,
        evaluation: { sumEvaluations: 0, numberOfEvaluations: 0, sumPro: 0, sumCon: 0 },
        numberOfOptions: 3,
      },
    ],
  });

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    jest.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    (console.info as jest.Mock).mockRestore();
  });

  describe('rendering', () => {
    it('should render children content', () => {
      render(
        <SurveyQuestionWrapper
          survey={createMockSurvey()}
          currentIndex={0}
          totalFlowItems={2}
          questionId="q1"
          mergedSettings={defaultSettings}
        >
          <div data-testid="child-content">Child Content</div>
        </SurveyQuestionWrapper>
      );

      expect(screen.getByTestId('child-content')).toBeInTheDocument();
    });

    it('should render progress bar', () => {
      render(
        <SurveyQuestionWrapper
          survey={createMockSurvey()}
          currentIndex={0}
          totalFlowItems={2}
          questionId="q1"
          mergedSettings={defaultSettings}
        >
          <div>Content</div>
        </SurveyQuestionWrapper>
      );

      expect(screen.getByTestId('survey-progress')).toBeInTheDocument();
      expect(screen.getByText(/1\/2/)).toBeInTheDocument();
    });

    it('should render navigation', () => {
      render(
        <SurveyQuestionWrapper
          survey={createMockSurvey()}
          currentIndex={0}
          totalFlowItems={2}
          questionId="q1"
          mergedSettings={defaultSettings}
        >
          <div>Content</div>
        </SurveyQuestionWrapper>
      );

      expect(screen.getByTestId('survey-navigation')).toBeInTheDocument();
    });
  });

  describe('localStorage persistence', () => {
    it('should load completed indices from localStorage', () => {
      const storageKey = 'survey_progress_survey-123';
      localStorage.setItem(storageKey, JSON.stringify({
        completedIndices: [0, 1],
        lastUpdated: Date.now(),
      }));

      render(
        <SurveyQuestionWrapper
          survey={createMockSurvey()}
          currentIndex={2}
          totalFlowItems={3}
          questionId="q2"
          mergedSettings={defaultSettings}
        >
          <div>Content</div>
        </SurveyQuestionWrapper>
      );

      // Component should load without errors
      expect(screen.getByTestId('survey-navigation')).toBeInTheDocument();
    });

    it('should save completed index on next navigation', () => {
      render(
        <SurveyQuestionWrapper
          survey={createMockSurvey()}
          currentIndex={0}
          totalFlowItems={2}
          questionId="q1"
          mergedSettings={defaultSettings}
        >
          <div>Content</div>
        </SurveyQuestionWrapper>
      );

      // Click next
      fireEvent.click(screen.getByText('Next'));

      const storageKey = 'survey_progress_survey-123';
      const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
      expect(stored.completedIndices).toContain(0);
    });

    it('should handle invalid localStorage data gracefully', () => {
      const storageKey = 'survey_progress_survey-123';
      localStorage.setItem(storageKey, 'invalid-json');

      // Should render without throwing
      render(
        <SurveyQuestionWrapper
          survey={createMockSurvey()}
          currentIndex={0}
          totalFlowItems={2}
          questionId="q1"
          mergedSettings={defaultSettings}
        >
          <div>Content</div>
        </SurveyQuestionWrapper>
      );

      expect(screen.getByTestId('survey-navigation')).toBeInTheDocument();
    });
  });

  describe('custom events', () => {
    it('should update evaluated count on solution-evaluated event', async () => {
      render(
        <SurveyQuestionWrapper
          survey={createMockSurvey()}
          currentIndex={0}
          totalFlowItems={2}
          questionId="q1"
          mergedSettings={defaultSettings}
        >
          <div>Content</div>
        </SurveyQuestionWrapper>
      );

      // Dispatch custom event
      window.dispatchEvent(
        new CustomEvent('solution-evaluated', {
          detail: { questionId: 'q1' },
        })
      );

      await waitFor(() => {
        expect(screen.getByTestId('evaluated-count')).toHaveTextContent('1');
      });
    });

    it('should update evaluated count on evaluations-loaded event', async () => {
      render(
        <SurveyQuestionWrapper
          survey={createMockSurvey()}
          currentIndex={0}
          totalFlowItems={2}
          questionId="q1"
          mergedSettings={defaultSettings}
        >
          <div>Content</div>
        </SurveyQuestionWrapper>
      );

      // Dispatch initial count event
      window.dispatchEvent(
        new CustomEvent('evaluations-loaded', {
          detail: { count: 5, questionId: 'q1' },
        })
      );

      await waitFor(() => {
        expect(screen.getByTestId('evaluated-count')).toHaveTextContent('5');
      });
    });

    it('should update solutions count on solutions-loaded event', async () => {
      render(
        <SurveyQuestionWrapper
          survey={createMockSurvey()}
          currentIndex={0}
          totalFlowItems={2}
          questionId="q1"
          mergedSettings={defaultSettings}
        >
          <div>Content</div>
        </SurveyQuestionWrapper>
      );

      // Dispatch solutions loaded event
      window.dispatchEvent(
        new CustomEvent('solutions-loaded', {
          detail: { count: 8, questionId: 'q1' },
        })
      );

      await waitFor(() => {
        expect(screen.getByTestId('solutions-count')).toHaveTextContent('8');
      });
    });

    it('should ignore events for different question', async () => {
      render(
        <SurveyQuestionWrapper
          survey={createMockSurvey()}
          currentIndex={0}
          totalFlowItems={2}
          questionId="q1"
          mergedSettings={defaultSettings}
        >
          <div>Content</div>
        </SurveyQuestionWrapper>
      );

      // Dispatch event for different question
      window.dispatchEvent(
        new CustomEvent('solution-evaluated', {
          detail: { questionId: 'q2' },
        })
      );

      // Should remain at 0
      expect(screen.getByTestId('evaluated-count')).toHaveTextContent('0');
    });

    it('should dispatch trigger-add-suggestion event when button clicked', async () => {
      const eventListener = jest.fn();
      window.addEventListener('trigger-add-suggestion', eventListener);

      render(
        <SurveyQuestionWrapper
          survey={createMockSurvey()}
          currentIndex={0}
          totalFlowItems={2}
          questionId="q1"
          mergedSettings={defaultSettings}
        >
          <div>Content</div>
        </SurveyQuestionWrapper>
      );

      fireEvent.click(screen.getByTestId('add-suggestion'));

      expect(eventListener).toHaveBeenCalled();
      window.removeEventListener('trigger-add-suggestion', eventListener);
    });

    it('should show view progress button when event received', async () => {
      render(
        <SurveyQuestionWrapper
          survey={createMockSurvey()}
          currentIndex={0}
          totalFlowItems={2}
          questionId="q1"
          mergedSettings={defaultSettings}
        >
          <div>Content</div>
        </SurveyQuestionWrapper>
      );

      // Initially not shown
      expect(screen.queryByTestId('view-progress')).not.toBeInTheDocument();

      // Dispatch show event
      window.dispatchEvent(
        new CustomEvent('show-view-progress', {
          detail: { show: true },
        })
      );

      await waitFor(() => {
        expect(screen.getByTestId('view-progress')).toBeInTheDocument();
      });
    });
  });

  describe('action buttons', () => {
    it('should show add suggestion when allowParticipantsToAddSuggestions is true', () => {
      render(
        <SurveyQuestionWrapper
          survey={createMockSurvey()}
          currentIndex={0}
          totalFlowItems={2}
          questionId="q1"
          mergedSettings={{ ...defaultSettings, allowParticipantsToAddSuggestions: true }}
        >
          <div>Content</div>
        </SurveyQuestionWrapper>
      );

      expect(screen.getByTestId('add-suggestion')).toBeInTheDocument();
    });

    it('should hide add suggestion when allowParticipantsToAddSuggestions is false', () => {
      render(
        <SurveyQuestionWrapper
          survey={createMockSurvey()}
          currentIndex={0}
          totalFlowItems={2}
          questionId="q1"
          mergedSettings={{ ...defaultSettings, allowParticipantsToAddSuggestions: false }}
        >
          <div>Content</div>
        </SurveyQuestionWrapper>
      );

      expect(screen.queryByTestId('add-suggestion')).not.toBeInTheDocument();
    });
  });

  describe('question fallback', () => {
    it('should use numberOfOptions from question when no solutions loaded', () => {
      render(
        <SurveyQuestionWrapper
          survey={createMockSurvey()}
          currentIndex={0}
          totalFlowItems={2}
          questionId="q1"
          mergedSettings={defaultSettings}
        >
          <div>Content</div>
        </SurveyQuestionWrapper>
      );

      // Should use numberOfOptions from the question (5)
      expect(screen.getByTestId('solutions-count')).toHaveTextContent('5');
    });
  });
});
