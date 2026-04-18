/**
 * @jest-environment jsdom
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ClosedSurveyView from '../ClosedSurveyView';

// Mock i18n — return keys so assertions are stable across locales
jest.mock('@freedi/shared-i18n/next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    dir: 'ltr',
  }),
}));

// Mock error logger (pulls in Sentry otherwise)
const logErrorMock = jest.fn();
jest.mock('@/lib/utils/errorHandling', () => ({
  logError: (...args: unknown[]) => logErrorMock(...args),
}));

// Stub WizColAttribution — it has its own deps (logo assets, ShareButtons)
// that aren't relevant to this component's behaviour.
jest.mock('../../shared/WizColAttribution', () => ({
  __esModule: true,
  default: () => <div data-testid="wizcol-attribution" />,
}));

const SURVEY_TITLE = 'Neighborhood Budget Priorities';
const PRIMARY_STATEMENT_ID = 'stmt-primary-123';

function renderView(props: Partial<React.ComponentProps<typeof ClosedSurveyView>> = {}) {
  return render(
    <ClosedSurveyView
      surveyTitle={SURVEY_TITLE}
      primaryStatementId={PRIMARY_STATEMENT_ID}
      {...props}
    />
  );
}

describe('ClosedSurveyView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // @ts-expect-error — clean up the fetch mock
    delete global.fetch;
  });

  describe('rendering', () => {
    it('shows the closed title, survey title, and explanatory message', () => {
      renderView();

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'surveyClosedTitle'
      );
      expect(screen.getByText(SURVEY_TITLE)).toBeInTheDocument();
      expect(screen.getByText('surveyClosedMessage')).toBeInTheDocument();
    });

    it('omits the survey title line when none is provided', () => {
      renderView({ surveyTitle: '' });
      expect(screen.queryByText(SURVEY_TITLE)).not.toBeInTheDocument();
    });

    it('renders the email form with notify-me copy and disabled submit initially only on submit', () => {
      renderView();

      expect(screen.getByText('notifyMeAboutUpdates')).toBeInTheDocument();
      expect(screen.getByText('notifyMeDescription')).toBeInTheDocument();

      const input = screen.getByPlaceholderText('enterEmail') as HTMLInputElement;
      expect(input).toBeInTheDocument();
      expect(input.type).toBe('email');
      expect(input).toBeRequired();

      const submit = screen.getByRole('button', { name: 'notifyMe' });
      expect(submit).toBeEnabled();
    });

    it('renders the WizCol attribution', () => {
      renderView();
      expect(screen.getByTestId('wizcol-attribution')).toBeInTheDocument();
    });
  });

  describe('submission', () => {
    it('POSTs the email with source=mass-consensus-closed and shows success', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      renderView();

      fireEvent.change(screen.getByPlaceholderText('enterEmail'), {
        target: { value: 'new@example.com' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'notifyMe' }));

      await waitFor(() =>
        expect(screen.getByText('subscribedSuccessfully')).toBeInTheDocument()
      );

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe(`/api/statements/${PRIMARY_STATEMENT_ID}/subscribe`);
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(JSON.parse(init.body)).toEqual({
        email: 'new@example.com',
        source: 'mass-consensus-closed',
      });

      // Form is replaced by the success message
      expect(
        screen.queryByRole('button', { name: 'notifyMe' })
      ).not.toBeInTheDocument();
    });

    it('shows an error and keeps the form when the API responds non-2xx', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'boom' }),
      });

      renderView();

      fireEvent.change(screen.getByPlaceholderText('enterEmail'), {
        target: { value: 'err@example.com' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'notifyMe' }));

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent('subscriptionFailed')
      );

      // Form still present so user can retry
      expect(
        screen.getByRole('button', { name: 'notifyMe' })
      ).toBeInTheDocument();
      expect(screen.queryByText('subscribedSuccessfully')).not.toBeInTheDocument();
      expect(logErrorMock).toHaveBeenCalledTimes(1);
      expect(logErrorMock.mock.calls[0][1]).toMatchObject({
        operation: 'ClosedSurveyView.handleSubmit',
        metadata: { primaryStatementId: PRIMARY_STATEMENT_ID },
      });
    });

    it('shows an error when fetch throws', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));

      renderView();

      fireEvent.change(screen.getByPlaceholderText('enterEmail'), {
        target: { value: 'offline@example.com' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'notifyMe' }));

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent('subscriptionFailed')
      );
      expect(logErrorMock).toHaveBeenCalledTimes(1);
    });

    it('disables the submit button and swaps its label while in-flight', async () => {
      let resolveFetch: (value: unknown) => void = () => {};
      (global.fetch as jest.Mock).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          })
      );

      renderView();

      fireEvent.change(screen.getByPlaceholderText('enterEmail'), {
        target: { value: 'pending@example.com' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'notifyMe' }));

      const submitting = await screen.findByRole('button', { name: 'subscribing' });
      expect(submitting).toBeDisabled();

      // Finish the request so the test can clean up without dangling promises
      await act(async () => {
        resolveFetch({ ok: true, json: async () => ({}) });
      });

      await waitFor(() =>
        expect(screen.getByText('subscribedSuccessfully')).toBeInTheDocument()
      );
    });

    it('does not fire a duplicate request on double-click', async () => {
      let resolveFetch: (value: unknown) => void = () => {};
      (global.fetch as jest.Mock).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          })
      );

      renderView();

      fireEvent.change(screen.getByPlaceholderText('enterEmail'), {
        target: { value: 'dup@example.com' },
      });

      const button = screen.getByRole('button', { name: 'notifyMe' });
      fireEvent.click(button);
      // After the first click, the button label becomes 'subscribing' and is
      // disabled. A second click on the same (now-disabled) element should
      // not produce a second fetch.
      const submitting = await screen.findByRole('button', { name: 'subscribing' });
      fireEvent.click(submitting);

      expect(global.fetch).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveFetch({ ok: true, json: async () => ({}) });
      });
    });

    it('does not submit when the form is submitted without an email', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
      renderView();

      // Directly submit the form (bypasses HTML5 required) to cover the guard.
      const form = screen.getByPlaceholderText('enterEmail').closest('form');
      expect(form).not.toBeNull();

      await act(async () => {
        fireEvent.submit(form as HTMLFormElement);
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
