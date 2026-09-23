/**
 * @jest-environment jsdom
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { Survey, SurveyStatus, DEFAULT_SURVEY_SETTINGS } from '@/types/survey';
import { UI } from '@/constants/common';
import SurveyForm from '../SurveyForm';

jest.mock('@freedi/shared-i18n/next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    dir: 'ltr',
  }),
}));

const logErrorMock = jest.fn();
jest.mock('@/lib/utils/errorHandling', () => ({
  logError: (...args: unknown[]) => logErrorMock(...args),
}));

const pushMock = jest.fn();
const routerMock = { push: pushMock };
jest.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

// Stable like the real provider's useCallback.
const refreshTokenMock = () => Promise.resolve('token');
jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({ refreshToken: refreshTokenMock }),
}));

const authedFetchMock = jest.fn();
jest.mock('@/lib/api/authedFetch', () => ({
  authedFetch: (...args: unknown[]) => authedFetchMock(...args),
}));

// Children with their own data loading are irrelevant to the save behaviour.
jest.mock('../QuestionPicker', () => ({ __esModule: true, default: () => null }));
jest.mock('../UnifiedFlowEditor', () => ({ __esModule: true, default: () => null }));
jest.mock('../LanguageSelector', () => ({ __esModule: true, default: () => null }));
jest.mock('../CreateQuestionModal', () => ({ CreateQuestionModal: () => null }));
jest.mock('../OpeningSlideManager', () => ({ __esModule: true, default: () => null }));
jest.mock('../CardColorIntensityControl', () => ({ __esModule: true, default: () => null }));

const SURVEY: Survey = {
  surveyId: 'survey-1',
  title: 'Budget priorities',
  creatorId: 'user-1',
  questionIds: [],
  settings: DEFAULT_SURVEY_SETTINGS,
  status: SurveyStatus.draft,
  createdAt: 1,
  lastUpdate: 1,
};

let failNextPut = false;

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) });
}

function surveyPuts() {
  return authedFetchMock.mock.calls.filter(
    ([url, init]) => url === `/api/surveys/${SURVEY.surveyId}` && init?.method === 'PUT'
  );
}

/** The toggles put their text beside the switch rather than inside a label. */
function toggleFor(labelKey: string): HTMLInputElement {
  const input = screen.getByText(labelKey).parentElement?.querySelector('input');
  if (!input) throw new Error(`No toggle for ${labelKey}`);

  return input;
}

async function renderEditor(onSurveyUpdate = jest.fn()) {
  render(<SurveyForm existingSurvey={SURVEY} onSurveyUpdate={onSurveyUpdate} />);
  // Let the demographics load settle so the form counts as hydrated.
  await act(async () => {
    await jest.runOnlyPendingTimersAsync();
  });

  return onSurveyUpdate;
}

async function advancePastAutosaveDelay() {
  await act(async () => {
    jest.advanceTimersByTime(UI.AUTOSAVE_DELAY);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe('SurveyForm autosave (edit mode)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    failNextPut = false;
    authedFetchMock.mockImplementation((url: string, init?: { method?: string; body?: string }) => {
      if (url.endsWith('/demographics') && !init?.method) return jsonResponse({ questions: [] });
      if (init?.method === 'PUT' && failNextPut) {
        failNextPut = false;

        return jsonResponse({ error: 'boom' }, false);
      }
      if (init?.method === 'PUT') return jsonResponse({ ...SURVEY, ...JSON.parse(init.body ?? '{}') });

      return jsonResponse({});
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('has no save button', async () => {
    await renderEditor();

    expect(screen.queryByText('saveChanges')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'createSurvey' })).not.toBeInTheDocument();
  });

  it('does not save what was just loaded', async () => {
    await renderEditor();
    await advancePastAutosaveDelay();

    expect(surveyPuts()).toHaveLength(0);
  });

  it('saves a changed setting after the delay and reports it', async () => {
    const onSurveyUpdate = await renderEditor();

    fireEvent.click(toggleFor('allowReturning'));
    expect(surveyPuts()).toHaveLength(0);

    await advancePastAutosaveDelay();

    const puts = surveyPuts();
    expect(puts).toHaveLength(1);
    const body = JSON.parse(puts[0][1].body);
    expect(body.settings.allowReturning).toBe(!DEFAULT_SURVEY_SETTINGS.allowReturning);
    expect(onSurveyUpdate).toHaveBeenCalledWith(expect.objectContaining({ surveyId: SURVEY.surveyId }));
    expect(screen.getByRole('status')).toHaveTextContent('allChangesSaved');
  });

  it('coalesces rapid typing into one save with the final text', async () => {
    await renderEditor();
    const titleInput = screen.getByLabelText('surveyTitle');

    fireEvent.change(titleInput, { target: { value: 'Budget p' } });
    await act(async () => {
      jest.advanceTimersByTime(UI.AUTOSAVE_DELAY / 2);
    });
    fireEvent.change(titleInput, { target: { value: 'Budget plan' } });
    await advancePastAutosaveDelay();

    const puts = surveyPuts();
    expect(puts).toHaveLength(1);
    expect(JSON.parse(puts[0][1].body).title).toBe('Budget plan');
  });

  it('does not save an empty title', async () => {
    await renderEditor();

    fireEvent.change(screen.getByLabelText('surveyTitle'), { target: { value: '   ' } });
    await advancePastAutosaveDelay();

    expect(surveyPuts()).toHaveLength(0);
    expect(screen.getByRole('status')).toHaveTextContent('titleRequired');
  });

  it('shows a retry when the save fails', async () => {
    await renderEditor();
    failNextPut = true;

    fireEvent.click(toggleFor('allowReturning'));
    await advancePastAutosaveDelay();

    expect(screen.getByRole('status')).toHaveTextContent('saveFailed');
    expect(logErrorMock).toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(surveyPuts()).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent('allChangesSaved');
  });
});
