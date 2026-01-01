/**
 * Tests for SurveyComplete component
 * @jest-environment jsdom
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SurveyComplete from '../SurveyComplete';
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

describe('SurveyComplete', () => {
  const createMockSurvey = (): SurveyWithQuestions => ({
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
  });

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    global.fetch = jest.fn();
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
  });

  describe('rendering', () => {
    it('should render completion title', () => {
      render(<SurveyComplete survey={createMockSurvey()} />);

      expect(screen.getByText('surveyComplete')).toBeInTheDocument();
    });

    it('should render thank you message', () => {
      render(<SurveyComplete survey={createMockSurvey()} />);

      expect(screen.getByText('thankYouForParticipating')).toBeInTheDocument();
    });

    it('should render check icon', () => {
      const { container } = render(<SurveyComplete survey={createMockSurvey()} />);

      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('should render total questions count', () => {
      render(<SurveyComplete survey={createMockSurvey()} />);

      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('totalQuestions')).toBeInTheDocument();
    });
  });

  describe('stats from localStorage', () => {
    it('should load completed questions count from localStorage', () => {
      const storageKey = 'survey_progress_survey-123';
      localStorage.setItem(storageKey, JSON.stringify({
        completedIndices: [0, 1],
        lastUpdated: Date.now(),
      }));

      render(<SurveyComplete survey={createMockSurvey()} />);

      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('questionsAnswered')).toBeInTheDocument();
    });

    it('should handle invalid localStorage data', () => {
      const storageKey = 'survey_progress_survey-123';
      localStorage.setItem(storageKey, 'invalid-json');

      render(<SurveyComplete survey={createMockSurvey()} />);

      // Should still render with 0 completed
      expect(screen.getByText('0')).toBeInTheDocument();
    });
  });

  describe('email subscription', () => {
    it('should render email signup form', () => {
      render(<SurveyComplete survey={createMockSurvey()} />);

      expect(screen.getByText('stayUpdated')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('enterEmail')).toBeInTheDocument();
    });

    it('should submit email and subscribe', async () => {
      const user = userEvent.setup();
      render(<SurveyComplete survey={createMockSurvey()} />);

      const emailInput = screen.getByPlaceholderText('enterEmail');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /subscribe/i });
      await user.click(submitButton);

      await waitFor(() => {
        // Should call subscribe for each question
        expect(global.fetch).toHaveBeenCalledTimes(3);
      });
    });

    it('should show success message after subscription', async () => {
      const user = userEvent.setup();
      render(<SurveyComplete survey={createMockSurvey()} />);

      const emailInput = screen.getByPlaceholderText('enterEmail');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /subscribe/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('subscribedSuccessfully')).toBeInTheDocument();
      });
    });

    it('should show loading state during submission', async () => {
      const user = userEvent.setup();
      let resolvePromise: () => void;
      (global.fetch as jest.Mock).mockReturnValue(
        new Promise((resolve) => {
          resolvePromise = () => resolve({ ok: true });
        })
      );

      render(<SurveyComplete survey={createMockSurvey()} />);

      const emailInput = screen.getByPlaceholderText('enterEmail');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /subscribe/i });
      await user.click(submitButton);

      expect(screen.getByText('subscribing')).toBeInTheDocument();

      resolvePromise!();
    });

    it('should disable button during submission', async () => {
      const user = userEvent.setup();
      let resolvePromise: () => void;
      (global.fetch as jest.Mock).mockReturnValue(
        new Promise((resolve) => {
          resolvePromise = () => resolve({ ok: true });
        })
      );

      render(<SurveyComplete survey={createMockSurvey()} />);

      const emailInput = screen.getByPlaceholderText('enterEmail');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /subscribe/i });
      await user.click(submitButton);

      expect(submitButton).toBeDisabled();

      resolvePromise!();
    });

    it('should handle subscription error gracefully', async () => {
      const user = userEvent.setup();
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      render(<SurveyComplete survey={createMockSurvey()} />);

      const emailInput = screen.getByPlaceholderText('enterEmail');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /subscribe/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(submitButton).not.toBeDisabled();
      });

      consoleSpy.mockRestore();
    });
  });

  describe('navigation', () => {
    it('should render review answers button', () => {
      render(<SurveyComplete survey={createMockSurvey()} />);

      expect(screen.getByRole('button', { name: /reviewAnswers/i })).toBeInTheDocument();
    });

    it('should navigate to first question when review clicked', async () => {
      const user = userEvent.setup();
      render(<SurveyComplete survey={createMockSurvey()} />);

      await user.click(screen.getByRole('button', { name: /reviewAnswers/i }));

      expect(mockPush).toHaveBeenCalledWith('/s/survey-123/q/0');
    });
  });
});
