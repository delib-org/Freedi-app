/**
 * @jest-environment jsdom
 */

import { render, screen, act } from '@testing-library/react';
import { SurveyStatus, DEFAULT_SURVEY_SETTINGS, type SurveyWithQuestions } from '@/types/survey';
import SurveyComplete from '../SurveyComplete';

jest.mock('@freedi/shared-i18n/next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    tWithParams: (key: string) => key,
    dir: 'ltr',
  }),
}));

jest.mock('@/lib/utils/errorHandling', () => ({
  logError: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({ user: null, isLoading: false }),
}));

jest.mock('@/lib/utils/user', () => ({
  getOrCreateAnonymousUser: () => 'anon-1',
}));

jest.mock('../../shared/WizColAttribution', () => ({
  __esModule: true,
  default: () => null,
}));

// Markdown rendering is MarkdownRenderer's own concern; show the raw text.
jest.mock('../../shared/MarkdownRenderer', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src }: { src: string }) => <span data-testid="hero" data-src={src} />,
}));

const SURVEY: SurveyWithQuestions = {
  surveyId: 'survey-1',
  title: 'Budget',
  creatorId: 'user-1',
  questionIds: [],
  questions: [],
  settings: DEFAULT_SURVEY_SETTINGS,
  status: SurveyStatus.active,
  createdAt: 1,
  lastUpdate: 1,
};

async function renderComplete(survey: SurveyWithQuestions) {
  render(<SurveyComplete survey={survey} />);
  // Let the progress fetch settle
  await act(async () => {
    await Promise.resolve();
  });
}

describe('SurveyComplete - completion message', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) });
  });

  it('shows the default completion screen when there is no message', async () => {
    await renderComplete(SURVEY);

    expect(screen.getByText('surveyComplete')).toBeInTheDocument();
    expect(screen.queryByTestId('markdown')).not.toBeInTheDocument();
  });

  it("shows the admin's message the way an explanation page shows it", async () => {
    await renderComplete({
      ...SURVEY,
      completionMessage: {
        explanationPageId: 'completion-message',
        title: 'Thanks',
        content: '## See you at the meeting',
        position: -1,
        heroImageUrl: 'https://example.com/hero.png',
      },
    });

    expect(screen.getByTestId('markdown')).toHaveTextContent('## See you at the meeting');
    expect(screen.getByTestId('hero')).toHaveAttribute('data-src', 'https://example.com/hero.png');
    expect(screen.getByText('thankYouForParticipating')).toBeInTheDocument();
  });

  it('shows nothing for a message left empty', async () => {
    await renderComplete({
      ...SURVEY,
      completionMessage: { explanationPageId: 'completion-message', title: 'Thanks', content: '  ', position: -1 },
    });

    expect(screen.queryByTestId('markdown')).not.toBeInTheDocument();
  });
});
