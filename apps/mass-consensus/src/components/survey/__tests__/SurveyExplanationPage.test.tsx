/**
 * Tests for SurveyExplanationPage component
 * @jest-environment jsdom
 */

import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SurveyExplanationPage from '../SurveyExplanationPage';
import { SurveyWithQuestions } from '@/types/survey';
import type { SurveyExplanationPage as SurveyExplanationPageType } from '@freedi/shared-types';

// Mock next/navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

// Mock MarkdownRenderer
jest.mock('../../shared/MarkdownRenderer', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => (
    <div data-testid="markdown-renderer">{content}</div>
  ),
}));

// Mock SurveyProgress
jest.mock('../SurveyProgress', () => ({
  __esModule: true,
  default: ({ currentIndex, totalQuestions, isExplanation }: { currentIndex: number; totalQuestions: number; isExplanation: boolean }) => (
    <div data-testid="survey-progress">
      Progress: {currentIndex + 1} / {totalQuestions} {isExplanation ? '(explanation)' : ''}
    </div>
  ),
}));

// Mock getTotalFlowLength
jest.mock('@/types/survey', () => ({
  ...jest.requireActual('@/types/survey'),
  getTotalFlowLength: jest.fn((survey) => survey.questions.length + (survey.demographicPageIds?.length || 0)),
}));

describe('SurveyExplanationPage', () => {
  const createMockSurvey = (overrides: Partial<SurveyWithQuestions> = {}): SurveyWithQuestions => ({
    surveyId: 'survey-123',
    title: 'Test Survey',
    creatorId: 'creator-123',
    questionIds: ['q1', 'q2', 'q3'],
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
      { statementId: 'q1', statement: 'Q1', parentId: '', creatorId: '', lastUpdate: Date.now(), createdAt: Date.now(), statementType: 'question', consensus: 0, evaluation: { sumEvaluations: 0, numberOfEvaluations: 0, sumPro: 0, sumCon: 0 } },
      { statementId: 'q2', statement: 'Q2', parentId: '', creatorId: '', lastUpdate: Date.now(), createdAt: Date.now(), statementType: 'question', consensus: 0, evaluation: { sumEvaluations: 0, numberOfEvaluations: 0, sumPro: 0, sumCon: 0 } },
      { statementId: 'q3', statement: 'Q3', parentId: '', creatorId: '', lastUpdate: Date.now(), createdAt: Date.now(), statementType: 'question', consensus: 0, evaluation: { sumEvaluations: 0, numberOfEvaluations: 0, sumPro: 0, sumCon: 0 } },
    ],
    ...overrides,
  });

  const createMockExplanationPage = (overrides: Partial<SurveyExplanationPageType> = {}): SurveyExplanationPageType => ({
    id: 'exp-1',
    title: 'Explanation Title',
    content: 'This is the explanation content.',
    createdAt: Date.now(),
    lastUpdate: Date.now(),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render explanation title', () => {
      render(
        <SurveyExplanationPage
          survey={createMockSurvey()}
          explanationPage={createMockExplanationPage({ title: 'My Explanation' })}
          currentFlowIndex={0}
        />
      );

      expect(screen.getByRole('heading', { name: 'My Explanation' })).toBeInTheDocument();
    });

    it('should render explanation content with MarkdownRenderer', () => {
      render(
        <SurveyExplanationPage
          survey={createMockSurvey()}
          explanationPage={createMockExplanationPage({ content: 'Markdown **content**' })}
          currentFlowIndex={0}
        />
      );

      expect(screen.getByTestId('markdown-renderer')).toHaveTextContent('Markdown **content**');
    });

    it('should render hero image when provided', () => {
      render(
        <SurveyExplanationPage
          survey={createMockSurvey()}
          explanationPage={createMockExplanationPage({ heroImageUrl: 'https://example.com/hero.jpg' })}
          currentFlowIndex={0}
        />
      );

      const img = screen.getByRole('presentation');
      expect(img).toHaveAttribute('src', 'https://example.com/hero.jpg');
    });

    it('should not render hero image when not provided', () => {
      render(
        <SurveyExplanationPage
          survey={createMockSurvey()}
          explanationPage={createMockExplanationPage({ heroImageUrl: undefined })}
          currentFlowIndex={0}
        />
      );

      expect(screen.queryByRole('presentation')).not.toBeInTheDocument();
    });

    it('should render progress bar', () => {
      render(
        <SurveyExplanationPage
          survey={createMockSurvey()}
          explanationPage={createMockExplanationPage()}
          currentFlowIndex={1}
        />
      );

      expect(screen.getByTestId('survey-progress')).toBeInTheDocument();
      expect(screen.getByTestId('survey-progress')).toHaveTextContent('explanation');
    });
  });

  describe('navigation buttons', () => {
    it('should show continue button by default', () => {
      render(
        <SurveyExplanationPage
          survey={createMockSurvey()}
          explanationPage={createMockExplanationPage()}
          currentFlowIndex={0}
        />
      );

      expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
    });

    it('should show finish button on last item', () => {
      render(
        <SurveyExplanationPage
          survey={createMockSurvey()}
          explanationPage={createMockExplanationPage()}
          currentFlowIndex={2} // Last of 3 questions
        />
      );

      expect(screen.getByRole('button', { name: /finish/i })).toBeInTheDocument();
    });

    it('should show back button when allowReturning and not first item', () => {
      render(
        <SurveyExplanationPage
          survey={createMockSurvey()}
          explanationPage={createMockExplanationPage()}
          currentFlowIndex={1}
        />
      );

      expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
    });

    it('should not show back button on first item', () => {
      render(
        <SurveyExplanationPage
          survey={createMockSurvey()}
          explanationPage={createMockExplanationPage()}
          currentFlowIndex={0}
        />
      );

      expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument();
    });

    it('should not show back button when allowReturning is false', () => {
      const survey = createMockSurvey();
      survey.settings.allowReturning = false;

      render(
        <SurveyExplanationPage
          survey={survey}
          explanationPage={createMockExplanationPage()}
          currentFlowIndex={1}
        />
      );

      expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument();
    });
  });

  describe('navigation actions', () => {
    it('should navigate to next question on continue click', async () => {
      const user = userEvent.setup();
      render(
        <SurveyExplanationPage
          survey={createMockSurvey({ surveyId: 'my-survey' })}
          explanationPage={createMockExplanationPage()}
          currentFlowIndex={0}
        />
      );

      await user.click(screen.getByRole('button', { name: /continue/i }));

      expect(mockPush).toHaveBeenCalledWith('/s/my-survey/q/1');
    });

    it('should navigate to complete on finish click', async () => {
      const user = userEvent.setup();
      render(
        <SurveyExplanationPage
          survey={createMockSurvey({ surveyId: 'my-survey' })}
          explanationPage={createMockExplanationPage()}
          currentFlowIndex={2} // Last item
        />
      );

      await user.click(screen.getByRole('button', { name: /finish/i }));

      expect(mockPush).toHaveBeenCalledWith('/s/my-survey/complete');
    });

    it('should navigate to previous question on back click', async () => {
      const user = userEvent.setup();
      render(
        <SurveyExplanationPage
          survey={createMockSurvey({ surveyId: 'my-survey' })}
          explanationPage={createMockExplanationPage()}
          currentFlowIndex={2}
        />
      );

      await user.click(screen.getByRole('button', { name: /back/i }));

      expect(mockPush).toHaveBeenCalledWith('/s/my-survey/q/1');
    });
  });

  describe('loading states', () => {
    it('should disable buttons during navigation', async () => {
      const user = userEvent.setup();
      render(
        <SurveyExplanationPage
          survey={createMockSurvey()}
          explanationPage={createMockExplanationPage()}
          currentFlowIndex={1}
        />
      );

      const continueButton = screen.getByRole('button', { name: /continue/i });
      await user.click(continueButton);

      // After first click, button should be disabled
      expect(continueButton).toBeDisabled();
    });

    it('should show spinner when navigating', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <SurveyExplanationPage
          survey={createMockSurvey()}
          explanationPage={createMockExplanationPage()}
          currentFlowIndex={1}
        />
      );

      await user.click(screen.getByRole('button', { name: /continue/i }));

      expect(container.querySelector('.buttonSpinner')).toBeInTheDocument();
    });

    it('should have aria-busy when loading', async () => {
      const user = userEvent.setup();
      render(
        <SurveyExplanationPage
          survey={createMockSurvey()}
          explanationPage={createMockExplanationPage()}
          currentFlowIndex={1}
        />
      );

      const continueButton = screen.getByRole('button', { name: /continue/i });
      await user.click(continueButton);

      expect(continueButton).toHaveAttribute('aria-busy', 'true');
    });
  });
});
