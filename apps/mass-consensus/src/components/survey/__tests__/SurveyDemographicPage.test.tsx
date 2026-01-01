/**
 * Tests for SurveyDemographicPage component
 * @jest-environment jsdom
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SurveyDemographicPage from '../SurveyDemographicPage';
import { SurveyWithQuestions } from '@/types/survey';
import type { SurveyDemographicPage as SurveyDemographicPageType, SurveyDemographicQuestion } from '@freedi/shared-types';
import { UserDemographicQuestionType } from '@freedi/shared-types';

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

// Mock InlineMarkdown
jest.mock('../../shared/InlineMarkdown', () => ({
  __esModule: true,
  default: ({ text }: { text: string }) => <span>{text}</span>,
}));

// Mock SurveyProgress
jest.mock('../SurveyProgress', () => ({
  __esModule: true,
  default: () => <div data-testid="survey-progress">Progress</div>,
}));

// Mock getTotalFlowLength
jest.mock('@/types/survey', () => ({
  ...jest.requireActual('@/types/survey'),
  getTotalFlowLength: jest.fn(() => 5),
}));

describe('SurveyDemographicPage', () => {
  const createMockSurvey = (): SurveyWithQuestions => ({
    surveyId: 'survey-123',
    title: 'Test Survey',
    creatorId: 'creator-123',
    questionIds: ['q1'],
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
    questions: [],
  });

  const createMockDemographicPage = (): SurveyDemographicPageType => ({
    demographicPageId: 'demo-page-1',
    title: 'About You',
    questionIds: ['dq1', 'dq2'],
    required: false,
    createdAt: Date.now(),
    lastUpdate: Date.now(),
  });

  const createMockQuestions = (): SurveyDemographicQuestion[] => [
    {
      questionId: 'dq1',
      question: 'What is your age?',
      type: UserDemographicQuestionType.number,
      required: true,
      createdAt: Date.now(),
      lastUpdate: Date.now(),
    },
    {
      questionId: 'dq2',
      question: 'What is your gender?',
      type: UserDemographicQuestionType.radio,
      required: false,
      options: [
        { option: 'Male' },
        { option: 'Female' },
        { option: 'Other' },
        { option: 'Prefer not to say' },
      ],
      createdAt: Date.now(),
      lastUpdate: Date.now(),
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  describe('rendering', () => {
    it('should render page title', () => {
      render(
        <SurveyDemographicPage
          survey={createMockSurvey()}
          demographicPage={createMockDemographicPage()}
          questions={createMockQuestions()}
          currentFlowIndex={0}
        />
      );

      expect(screen.getByText('About You')).toBeInTheDocument();
    });

    it('should render all questions', () => {
      render(
        <SurveyDemographicPage
          survey={createMockSurvey()}
          demographicPage={createMockDemographicPage()}
          questions={createMockQuestions()}
          currentFlowIndex={0}
        />
      );

      expect(screen.getByText('What is your age?')).toBeInTheDocument();
      expect(screen.getByText('What is your gender?')).toBeInTheDocument();
    });

    it('should render progress bar', () => {
      render(
        <SurveyDemographicPage
          survey={createMockSurvey()}
          demographicPage={createMockDemographicPage()}
          questions={createMockQuestions()}
          currentFlowIndex={0}
        />
      );

      expect(screen.getByTestId('survey-progress')).toBeInTheDocument();
    });

    it('should show required indicator for required questions', () => {
      const questions: SurveyDemographicQuestion[] = [
        {
          questionId: 'dq1',
          question: 'Required question',
          type: UserDemographicQuestionType.text,
          required: true,
          createdAt: Date.now(),
          lastUpdate: Date.now(),
        },
      ];

      render(
        <SurveyDemographicPage
          survey={createMockSurvey()}
          demographicPage={createMockDemographicPage()}
          questions={questions}
          currentFlowIndex={0}
        />
      );

      expect(screen.getByText('*')).toBeInTheDocument();
    });
  });

  describe('input types', () => {
    it('should render text input for text type', () => {
      const questions: SurveyDemographicQuestion[] = [
        {
          questionId: 'dq1',
          question: 'Your name',
          type: UserDemographicQuestionType.text,
          required: false,
          createdAt: Date.now(),
          lastUpdate: Date.now(),
        },
      ];

      render(
        <SurveyDemographicPage
          survey={createMockSurvey()}
          demographicPage={createMockDemographicPage()}
          questions={questions}
          currentFlowIndex={0}
        />
      );

      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('should render number input for number type', () => {
      const questions: SurveyDemographicQuestion[] = [
        {
          questionId: 'dq1',
          question: 'Your age',
          type: UserDemographicQuestionType.number,
          required: false,
          createdAt: Date.now(),
          lastUpdate: Date.now(),
        },
      ];

      render(
        <SurveyDemographicPage
          survey={createMockSurvey()}
          demographicPage={createMockDemographicPage()}
          questions={questions}
          currentFlowIndex={0}
        />
      );

      expect(screen.getByRole('spinbutton')).toBeInTheDocument();
    });

    it('should render radio buttons for radio type', () => {
      const questions: SurveyDemographicQuestion[] = [
        {
          questionId: 'dq1',
          question: 'Gender',
          type: UserDemographicQuestionType.radio,
          required: false,
          options: [{ option: 'Male' }, { option: 'Female' }],
          createdAt: Date.now(),
          lastUpdate: Date.now(),
        },
      ];

      render(
        <SurveyDemographicPage
          survey={createMockSurvey()}
          demographicPage={createMockDemographicPage()}
          questions={questions}
          currentFlowIndex={0}
        />
      );

      const radios = screen.getAllByRole('radio');
      expect(radios).toHaveLength(2);
    });

    it('should render checkboxes for checkbox type', () => {
      const questions: SurveyDemographicQuestion[] = [
        {
          questionId: 'dq1',
          question: 'Interests',
          type: UserDemographicQuestionType.checkbox,
          required: false,
          options: [{ option: 'Sports' }, { option: 'Music' }, { option: 'Art' }],
          createdAt: Date.now(),
          lastUpdate: Date.now(),
        },
      ];

      render(
        <SurveyDemographicPage
          survey={createMockSurvey()}
          demographicPage={createMockDemographicPage()}
          questions={questions}
          currentFlowIndex={0}
        />
      );

      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes).toHaveLength(3);
    });
  });

  describe('form interactions', () => {
    it('should update text input value', async () => {
      const user = userEvent.setup();
      const questions: SurveyDemographicQuestion[] = [
        {
          questionId: 'dq1',
          question: 'Your name',
          type: UserDemographicQuestionType.text,
          required: false,
          createdAt: Date.now(),
          lastUpdate: Date.now(),
        },
      ];

      render(
        <SurveyDemographicPage
          survey={createMockSurvey()}
          demographicPage={createMockDemographicPage()}
          questions={questions}
          currentFlowIndex={0}
        />
      );

      const input = screen.getByRole('textbox');
      await user.type(input, 'John Doe');

      expect(input).toHaveValue('John Doe');
    });

    it('should select radio option', async () => {
      const user = userEvent.setup();
      const questions: SurveyDemographicQuestion[] = [
        {
          questionId: 'dq1',
          question: 'Gender',
          type: UserDemographicQuestionType.radio,
          required: false,
          options: [{ option: 'Male' }, { option: 'Female' }],
          createdAt: Date.now(),
          lastUpdate: Date.now(),
        },
      ];

      render(
        <SurveyDemographicPage
          survey={createMockSurvey()}
          demographicPage={createMockDemographicPage()}
          questions={questions}
          currentFlowIndex={0}
        />
      );

      // The label contains InlineMarkdown which renders the text in a span
      const radios = screen.getAllByRole('radio');
      await user.click(radios[0]); // Click first radio (Male)

      expect(radios[0]).toBeChecked();
    });

    it('should toggle checkbox options', async () => {
      const user = userEvent.setup();
      const questions: SurveyDemographicQuestion[] = [
        {
          questionId: 'dq1',
          question: 'Interests',
          type: UserDemographicQuestionType.checkbox,
          required: false,
          options: [{ option: 'Sports' }, { option: 'Music' }],
          createdAt: Date.now(),
          lastUpdate: Date.now(),
        },
      ];

      render(
        <SurveyDemographicPage
          survey={createMockSurvey()}
          demographicPage={createMockDemographicPage()}
          questions={questions}
          currentFlowIndex={0}
        />
      );

      const checkboxes = screen.getAllByRole('checkbox');

      await user.click(checkboxes[0]); // Sports
      await user.click(checkboxes[1]); // Music

      expect(checkboxes[0]).toBeChecked();
      expect(checkboxes[1]).toBeChecked();

      await user.click(checkboxes[0]);
      expect(checkboxes[0]).not.toBeChecked();
    });
  });

  describe('validation', () => {
    it('should show error for empty required text field', async () => {
      const user = userEvent.setup();
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      const questions: SurveyDemographicQuestion[] = [
        {
          questionId: 'dq1',
          question: 'Required field',
          type: UserDemographicQuestionType.text,
          required: true,
          createdAt: Date.now(),
          lastUpdate: Date.now(),
        },
      ];

      render(
        <SurveyDemographicPage
          survey={createMockSurvey()}
          demographicPage={createMockDemographicPage()}
          questions={questions}
          currentFlowIndex={0}
        />
      );

      // Try to submit without filling required field - button says "next"
      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);

      expect(screen.getByText(/requiredField/i)).toBeInTheDocument();
    });

    it('should clear error when user starts typing', async () => {
      const user = userEvent.setup();
      const questions: SurveyDemographicQuestion[] = [
        {
          questionId: 'dq1',
          question: 'Required field',
          type: UserDemographicQuestionType.text,
          required: true,
          createdAt: Date.now(),
          lastUpdate: Date.now(),
        },
      ];

      render(
        <SurveyDemographicPage
          survey={createMockSurvey()}
          demographicPage={createMockDemographicPage()}
          questions={questions}
          currentFlowIndex={0}
        />
      );

      // Trigger validation error
      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);

      expect(screen.getByText(/requiredField/i)).toBeInTheDocument();

      // Start typing
      const input = screen.getByRole('textbox');
      await user.type(input, 'a');

      // Error should be cleared
      expect(screen.queryByText(/requiredField/i)).not.toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('should show next button', () => {
      render(
        <SurveyDemographicPage
          survey={createMockSurvey()}
          demographicPage={createMockDemographicPage()}
          questions={createMockQuestions()}
          currentFlowIndex={0}
        />
      );

      expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    });

    it('should show back button when allowed', () => {
      render(
        <SurveyDemographicPage
          survey={createMockSurvey()}
          demographicPage={createMockDemographicPage()}
          questions={createMockQuestions()}
          currentFlowIndex={1}
        />
      );

      expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
    });

    it('should navigate back when back button clicked', async () => {
      const user = userEvent.setup();
      render(
        <SurveyDemographicPage
          survey={createMockSurvey()}
          demographicPage={createMockDemographicPage()}
          questions={createMockQuestions()}
          currentFlowIndex={2}
        />
      );

      await user.click(screen.getByRole('button', { name: /back/i }));

      expect(mockPush).toHaveBeenCalledWith('/s/survey-123/q/1');
    });

    it('should show skip button', () => {
      render(
        <SurveyDemographicPage
          survey={createMockSurvey()}
          demographicPage={createMockDemographicPage()}
          questions={createMockQuestions()}
          currentFlowIndex={0}
        />
      );

      expect(screen.getByRole('button', { name: /skip/i })).toBeInTheDocument();
    });
  });

  describe('form submission', () => {
    it('should submit answers and navigate on success', async () => {
      const user = userEvent.setup();
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });

      const questions: SurveyDemographicQuestion[] = [
        {
          questionId: 'dq1',
          question: 'Your name',
          type: UserDemographicQuestionType.text,
          required: false,
          createdAt: Date.now(),
          lastUpdate: Date.now(),
        },
      ];

      render(
        <SurveyDemographicPage
          survey={createMockSurvey()}
          demographicPage={createMockDemographicPage()}
          questions={questions}
          currentFlowIndex={0}
        />
      );

      await user.type(screen.getByRole('textbox'), 'Test');
      await user.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });
    });

    it('should disable buttons during submission', async () => {
      const user = userEvent.setup();
      let resolvePromise: () => void;
      (global.fetch as jest.Mock).mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePromise = () => resolve({ ok: true });
        })
      );

      const questions: SurveyDemographicQuestion[] = [
        {
          questionId: 'dq1',
          question: 'Name',
          type: UserDemographicQuestionType.text,
          required: false,
          createdAt: Date.now(),
          lastUpdate: Date.now(),
        },
      ];

      render(
        <SurveyDemographicPage
          survey={createMockSurvey()}
          demographicPage={createMockDemographicPage()}
          questions={questions}
          currentFlowIndex={0}
        />
      );

      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);

      expect(nextButton).toBeDisabled();

      resolvePromise!();
    });
  });

  describe('existing answers', () => {
    it('should pre-fill form with existing answers', () => {
      const questions: SurveyDemographicQuestion[] = [
        {
          questionId: 'dq1',
          question: 'Your name',
          type: UserDemographicQuestionType.text,
          required: false,
          createdAt: Date.now(),
          lastUpdate: Date.now(),
        },
      ];

      const existingAnswers = [
        {
          demographicAnswerId: 'ans-1',
          surveyId: 'survey-123',
          demographicPageId: 'demo-page-1',
          questionId: 'dq1',
          userId: 'user-123',
          answer: 'John Doe',
          createdAt: Date.now(),
          lastUpdate: Date.now(),
        },
      ];

      render(
        <SurveyDemographicPage
          survey={createMockSurvey()}
          demographicPage={createMockDemographicPage()}
          questions={questions}
          currentFlowIndex={0}
          existingAnswers={existingAnswers}
        />
      );

      expect(screen.getByRole('textbox')).toHaveValue('John Doe');
    });
  });
});
