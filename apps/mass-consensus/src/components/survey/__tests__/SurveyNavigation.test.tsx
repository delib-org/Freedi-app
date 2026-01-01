/**
 * Tests for SurveyNavigation component
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SurveyNavigation from '../SurveyNavigation';
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

describe('SurveyNavigation', () => {
  const defaultSettings: MergedQuestionSettings = {
    allowSkipping: false,
    minEvaluationsPerQuestion: 3,
    maxEvaluationsPerQuestion: 10,
    showSolutions: true,
    allowAddingSolutions: true,
    showResults: false,
    shuffleSolutions: false,
  };

  const defaultProps = {
    surveyId: 'survey-123',
    currentIndex: 1,
    totalQuestions: 5,
    evaluatedCount: 0,
    availableOptionsCount: 10,
    mergedSettings: defaultSettings,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render back and next buttons', () => {
      render(<SurveyNavigation {...defaultProps} />);

      expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    });

    it('should show finish button on last question', () => {
      render(
        <SurveyNavigation
          {...defaultProps}
          currentIndex={4}
        />
      );

      expect(screen.getByRole('button', { name: /finish/i })).toBeInTheDocument();
    });

    it('should disable back button on first question', () => {
      render(
        <SurveyNavigation
          {...defaultProps}
          currentIndex={0}
        />
      );

      expect(screen.getByRole('button', { name: /back/i })).toBeDisabled();
    });

    it('should disable back button when allowReturning is false', () => {
      render(
        <SurveyNavigation
          {...defaultProps}
          allowReturning={false}
        />
      );

      expect(screen.getByRole('button', { name: /back/i })).toBeDisabled();
    });
  });

  describe('action buttons', () => {
    it('should show add suggestion button when enabled', () => {
      const onAddSuggestion = jest.fn();
      render(
        <SurveyNavigation
          {...defaultProps}
          showAddSuggestion
          onAddSuggestion={onAddSuggestion}
        />
      );

      expect(screen.getByTitle('Add Suggestion')).toBeInTheDocument();
    });

    it('should show view progress button when enabled', () => {
      const onViewProgress = jest.fn();
      render(
        <SurveyNavigation
          {...defaultProps}
          showViewProgress
          onViewProgress={onViewProgress}
        />
      );

      expect(screen.getByTitle('View Progress')).toBeInTheDocument();
    });

    it('should call onAddSuggestion when button clicked', async () => {
      const user = userEvent.setup();
      const onAddSuggestion = jest.fn();
      render(
        <SurveyNavigation
          {...defaultProps}
          showAddSuggestion
          onAddSuggestion={onAddSuggestion}
          evaluatedCount={3} // Meet minimum to not be disabled
        />
      );

      await user.click(screen.getByTitle('Add Suggestion'));
      expect(onAddSuggestion).toHaveBeenCalled();
    });

    it('should call onViewProgress when button clicked', async () => {
      const user = userEvent.setup();
      const onViewProgress = jest.fn();
      render(
        <SurveyNavigation
          {...defaultProps}
          showViewProgress
          onViewProgress={onViewProgress}
          evaluatedCount={3} // Meet minimum to not be disabled
        />
      );

      await user.click(screen.getByTitle('View Progress'));
      expect(onViewProgress).toHaveBeenCalled();
    });
  });

  describe('navigation', () => {
    it('should navigate back when back button clicked', async () => {
      const user = userEvent.setup();
      const onNavigate = jest.fn();
      render(
        <SurveyNavigation
          {...defaultProps}
          currentIndex={2}
          onNavigate={onNavigate}
        />
      );

      await user.click(screen.getByRole('button', { name: /back/i }));

      expect(onNavigate).toHaveBeenCalledWith('back');
      expect(mockPush).toHaveBeenCalledWith('/s/survey-123/q/1');
    });

    it('should navigate forward when next button clicked with sufficient evaluations', async () => {
      const user = userEvent.setup();
      const onNavigate = jest.fn();
      render(
        <SurveyNavigation
          {...defaultProps}
          evaluatedCount={3}
          onNavigate={onNavigate}
        />
      );

      await user.click(screen.getByRole('button', { name: /next/i }));

      expect(onNavigate).toHaveBeenCalledWith('next');
      expect(mockPush).toHaveBeenCalledWith('/s/survey-123/q/2');
    });

    it('should navigate to complete page on last question', async () => {
      const user = userEvent.setup();
      render(
        <SurveyNavigation
          {...defaultProps}
          currentIndex={4}
          evaluatedCount={3}
        />
      );

      await user.click(screen.getByRole('button', { name: /finish/i }));

      expect(mockPush).toHaveBeenCalledWith('/s/survey-123/complete');
    });
  });

  describe('evaluation requirements', () => {
    it('should disable next when evaluations below minimum', () => {
      render(
        <SurveyNavigation
          {...defaultProps}
          evaluatedCount={1}
          mergedSettings={{ ...defaultSettings, minEvaluationsPerQuestion: 3 }}
        />
      );

      expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
    });

    it('should enable next when evaluations meet minimum', () => {
      render(
        <SurveyNavigation
          {...defaultProps}
          evaluatedCount={3}
          mergedSettings={{ ...defaultSettings, minEvaluationsPerQuestion: 3 }}
        />
      );

      expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();
    });

    it('should enable next when allowSkipping is true', () => {
      render(
        <SurveyNavigation
          {...defaultProps}
          evaluatedCount={0}
          mergedSettings={{ ...defaultSettings, allowSkipping: true }}
        />
      );

      expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();
    });

    it('should show evaluations needed hint', () => {
      render(
        <SurveyNavigation
          {...defaultProps}
          evaluatedCount={1}
          mergedSettings={{ ...defaultSettings, minEvaluationsPerQuestion: 3 }}
        />
      );

      expect(screen.getByText(/evaluationsNeeded/i)).toBeInTheDocument();
    });

    it('should enable next when all available options evaluated', () => {
      render(
        <SurveyNavigation
          {...defaultProps}
          evaluatedCount={5}
          availableOptionsCount={5}
          mergedSettings={{ ...defaultSettings, minEvaluationsPerQuestion: 10 }}
        />
      );

      expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();
    });
  });

  describe('contributor-only mode', () => {
    it('should enable next in contributor-only mode', () => {
      render(
        <SurveyNavigation
          {...defaultProps}
          userSolutionCount={2}
          availableOptionsCount={2} // All solutions are user's own
          evaluatedCount={0}
          mergedSettings={{ ...defaultSettings, minEvaluationsPerQuestion: 3 }}
        />
      );

      expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();
    });

    it('should show contributor-only message', () => {
      render(
        <SurveyNavigation
          {...defaultProps}
          userSolutionCount={2}
          availableOptionsCount={2}
          evaluatedCount={0}
        />
      );

      expect(screen.getByText(/contributorOnlyMessage/i)).toBeInTheDocument();
    });
  });

  describe('loading states', () => {
    it('should show loading spinner when navigating', async () => {
      const user = userEvent.setup();
      render(
        <SurveyNavigation
          {...defaultProps}
          evaluatedCount={3}
        />
      );

      await user.click(screen.getByRole('button', { name: /next/i }));

      expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    });

    it('should disable buttons during navigation', async () => {
      const user = userEvent.setup();
      render(
        <SurveyNavigation
          {...defaultProps}
          evaluatedCount={3}
        />
      );

      await user.click(screen.getByRole('button', { name: /next/i }));

      const backButton = screen.getByRole('button', { name: /loading/i });
      expect(backButton).toBeDisabled();
    });
  });

  describe('edge cases', () => {
    it('should handle zero available options', () => {
      render(
        <SurveyNavigation
          {...defaultProps}
          availableOptionsCount={0}
          evaluatedCount={0}
        />
      );

      // Should still render without errors
      expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
    });

    it('should adjust minimum evaluations to available count', () => {
      render(
        <SurveyNavigation
          {...defaultProps}
          availableOptionsCount={2}
          evaluatedCount={2}
          mergedSettings={{ ...defaultSettings, minEvaluationsPerQuestion: 10 }}
        />
      );

      // Should be enabled because user evaluated all available (2)
      expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();
    });
  });
});
