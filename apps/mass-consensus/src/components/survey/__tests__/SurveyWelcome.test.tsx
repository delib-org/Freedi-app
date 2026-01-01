/**
 * Tests for SurveyWelcome component
 * @jest-environment jsdom
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SurveyWelcome from '../SurveyWelcome';
import { SurveyWithQuestions } from '@/types/survey';

// Mock next/navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

// Mock user utils
jest.mock('@/lib/utils/user', () => ({
  getOrCreateAnonymousUser: jest.fn(() => 'anon-user-123'),
}));

describe('SurveyWelcome', () => {
  const createMockSurvey = (overrides: Partial<SurveyWithQuestions> = {}): SurveyWithQuestions => ({
    surveyId: 'survey-123',
    title: 'Test Survey',
    creatorId: 'creator-123',
    questionIds: ['q1', 'q2', 'q3'],
    settings: {
      allowAnonymous: true,
      shuffleQuestions: false,
      showProgress: true,
    },
    questionSettings: {},
    status: 'active',
    createdAt: Date.now(),
    lastUpdate: Date.now(),
    questions: [
      { statementId: 'q1', statement: 'Q1', parentId: '', creatorId: '', lastUpdate: Date.now(), createdAt: Date.now(), statementType: 'question', consensus: 0, evaluation: { sumEvaluations: 0, numberOfEvaluations: 0, sumPro: 0, sumCon: 0 } },
      { statementId: 'q2', statement: 'Q2', parentId: '', creatorId: '', lastUpdate: Date.now(), createdAt: Date.now(), statementType: 'question', consensus: 0, evaluation: { sumEvaluations: 0, numberOfEvaluations: 0, sumPro: 0, sumCon: 0 } },
      { statementId: 'q3', statement: 'Q3', parentId: '', creatorId: '', lastUpdate: Date.now(), createdAt: Date.now(), statementType: 'question', consensus: 0, evaluation: { sumEvaluations: 0, numberOfEvaluations: 0, sumPro: 0, sumCon: 0 } },
    ],
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  describe('loading state', () => {
    it('should show loading spinner initially', () => {
      (global.fetch as jest.Mock).mockReturnValue(new Promise(() => {})); // Never resolves
      const { container } = render(<SurveyWelcome survey={createMockSurvey()} />);

      expect(container.querySelector('.loadingSpinner')).toBeInTheDocument();
    });

    it('should hide loading spinner after progress loads', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ hasProgress: false }),
      });

      const { container } = render(<SurveyWelcome survey={createMockSurvey()} />);

      await waitFor(() => {
        expect(container.querySelector('.loadingSpinner')).not.toBeInTheDocument();
      });
    });
  });

  describe('welcome content', () => {
    beforeEach(() => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ hasProgress: false }),
      });
    });

    it('should display survey title', async () => {
      render(<SurveyWelcome survey={createMockSurvey({ title: 'My Test Survey' })} />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'My Test Survey' })).toBeInTheDocument();
      });
    });

    it('should display survey description when provided', async () => {
      render(<SurveyWelcome survey={createMockSurvey({ description: 'Survey description text' })} />);

      await waitFor(() => {
        expect(screen.getByText('Survey description text')).toBeInTheDocument();
      });
    });

    it('should not display description when not provided', async () => {
      render(<SurveyWelcome survey={createMockSurvey({ description: undefined })} />);

      await waitFor(() => {
        expect(screen.getByRole('heading')).toBeInTheDocument();
      });

      // Verify no extra paragraphs with descriptions
      const paragraphs = screen.getAllByRole('paragraph', { hidden: true });
      expect(paragraphs.every(p => p.textContent !== '')).toBeTruthy();
    });

    it('should display start button', async () => {
      render(<SurveyWelcome survey={createMockSurvey()} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'startSurvey' })).toBeInTheDocument();
      });
    });
  });

  describe('navigation', () => {
    beforeEach(() => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ hasProgress: false }),
      });
    });

    it('should navigate to first question when start button clicked', async () => {
      const user = userEvent.setup();
      render(<SurveyWelcome survey={createMockSurvey({ surveyId: 'my-survey' })} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'startSurvey' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'startSurvey' }));

      expect(mockPush).toHaveBeenCalledWith('/s/my-survey/q/0');
    });
  });

  describe('resume modal', () => {
    it('should show resume modal when user has progress', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          hasProgress: true,
          isCompleted: false,
          currentQuestionIndex: 2,
          completedQuestionIds: ['q1', 'q2'],
        }),
      });

      render(<SurveyWelcome survey={createMockSurvey()} />);

      await waitFor(() => {
        expect(screen.getByText('welcomeBack')).toBeInTheDocument();
      });
    });

    it('should not show resume modal when no progress', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ hasProgress: false }),
      });

      render(<SurveyWelcome survey={createMockSurvey()} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'startSurvey' })).toBeInTheDocument();
      });

      expect(screen.queryByText('welcomeBack')).not.toBeInTheDocument();
    });

    it('should not show resume modal when survey is completed', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          hasProgress: true,
          isCompleted: true,
          currentQuestionIndex: 3,
        }),
      });

      render(<SurveyWelcome survey={createMockSurvey()} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'startSurvey' })).toBeInTheDocument();
      });

      expect(screen.queryByText('welcomeBack')).not.toBeInTheDocument();
    });

    it('should navigate to current question on continue', async () => {
      const user = userEvent.setup();
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          hasProgress: true,
          isCompleted: false,
          currentQuestionIndex: 2,
          completedQuestionIds: ['q1', 'q2'],
        }),
      });

      render(<SurveyWelcome survey={createMockSurvey({ surveyId: 'my-survey' })} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'continue' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'continue' }));

      expect(mockPush).toHaveBeenCalledWith('/s/my-survey/q/2');
    });

    it('should navigate to start on start over', async () => {
      const user = userEvent.setup();
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          hasProgress: true,
          isCompleted: false,
          currentQuestionIndex: 2,
          completedQuestionIds: ['q1', 'q2'],
        }),
      });

      render(<SurveyWelcome survey={createMockSurvey({ surveyId: 'my-survey' })} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'startOver' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'startOver' }));

      expect(mockPush).toHaveBeenCalledWith('/s/my-survey/q/0');
    });

    it('should display progress bar with correct width', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          hasProgress: true,
          isCompleted: false,
          currentQuestionIndex: 2,
          completedQuestionIds: ['q1', 'q2'],
        }),
      });

      const { container } = render(<SurveyWelcome survey={createMockSurvey()} />);

      await waitFor(() => {
        const progressBar = container.querySelector('.resumeProgressBar') as HTMLElement;
        expect(progressBar).toBeInTheDocument();
        // 2 of 3 questions = 66.67%
        expect(progressBar.style.width).toMatch(/66/);
      });
    });
  });

  describe('error handling', () => {
    it('should handle fetch error gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      render(<SurveyWelcome survey={createMockSurvey()} />);

      await waitFor(() => {
        // Should still show the welcome screen
        expect(screen.getByRole('button', { name: 'startSurvey' })).toBeInTheDocument();
      });

      consoleSpy.mockRestore();
    });

    it('should handle non-ok response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      render(<SurveyWelcome survey={createMockSurvey()} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'startSurvey' })).toBeInTheDocument();
      });
    });
  });
});
