import { act, render, screen } from '@testing-library/react';
import { useSelector } from 'react-redux';
import type { DeliberationStatus, Statement } from '@freedi/shared-types';
import { RETRY } from '@/constants/common';
import { requestDeliberation } from '@/controllers/db/deliberation';
import { logError } from '@/utils/errorHandling';
import QuestionProcess from '../QuestionProcess';

const POLL_MS = 60000;
const NOT_JOINED = {
	code: 'functions/permission-denied',
	message: 'Join the question before participating. [403]',
};
const ERROR_TEXT = 'Could not complete action.';
/** Stable like the real one: a new function per render would restart the polling. */
const mockTranslate = (key: string): string => key;

jest.mock('react-redux', () => ({ useSelector: jest.fn() }));
jest.mock('@/redux/statements/statementsSlice', () => ({ statementSelector: jest.fn() }));
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn(() => jest.fn()) }));
jest.mock('@/controllers/db/config', () => ({ functions: {} }));
jest.mock('@/controllers/db/deliberation', () => ({
	...jest.requireActual('@/controllers/db/deliberation'),
	requestDeliberation: jest.fn(),
	DELIBERATION_POLL_MS: 60000,
}));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: mockTranslate }),
}));
jest.mock('@/view/components/subGroupCard/SubGroupCardSummary', () => ({
	__esModule: true,
	default: () => null,
}));

const question = { statementId: 'q1', statement: 'What should we do?' } as Statement;
const call = requestDeliberation as unknown as jest.Mock;
const loaded = {
	data: { sources: [{ id: 's0', text: 'Source 0', cp: 0.5 }] } as unknown as DeliberationStatus,
};

/** Runs pending promises and any timers due in the next `ms`. */
async function advance(ms: number): Promise<void> {
	await act(async () => {
		await jest.advanceTimersByTimeAsync(ms);
	});
}

function renderResults(): void {
	render(<QuestionProcess statement={question} view="summary" />);
}

describe('QuestionProcess before the auto-subscribe finishes', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.clearAllMocks();
		call.mockReset();
		(useSelector as jest.Mock).mockReturnValue(question);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('shows no error and logs nothing for the not-yet-joined response', async () => {
		call.mockRejectedValue(NOT_JOINED);
		renderResults();
		await advance(0);

		expect(screen.queryByRole('alert')).toBeNull();
		expect(logError).not.toHaveBeenCalled();
	});

	it('retries soon and shows the data once the join has landed', async () => {
		call.mockRejectedValueOnce(NOT_JOINED).mockResolvedValue(loaded);
		renderResults();
		await advance(0);
		expect(call).toHaveBeenCalledTimes(1);

		await advance(RETRY.INITIAL_DELAY_MS);

		expect(call).toHaveBeenCalledTimes(2);
		expect(screen.getByText('Source 0')).toBeInTheDocument();
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('stops the fast retries at the limit, stays silent, and keeps polling', async () => {
		call.mockRejectedValue(NOT_JOINED);
		renderResults();
		await advance(0);

		await advance(POLL_MS - 1);
		expect(call).toHaveBeenCalledTimes(1 + RETRY.MAX_ATTEMPTS);
		expect(screen.queryByRole('alert')).toBeNull();

		await advance(1);
		expect(call).toHaveBeenCalledTimes(2 + RETRY.MAX_ATTEMPTS);
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('stops retrying after leaving the screen', async () => {
		call.mockRejectedValue(NOT_JOINED);
		const { unmount } = render(<QuestionProcess statement={question} view="summary" />);
		await advance(0);
		unmount();

		await advance(POLL_MS);

		expect(call).toHaveBeenCalledTimes(1);
	});

	it.each([
		[
			'a blocked member',
			{ code: 'functions/permission-denied', message: 'Membership is blocked. [403]' },
		],
		['a server failure', { code: 'functions/internal', message: 'internal' }],
		['a network error', new Error('offline')],
	])('still shows the error for %s, without a fast retry', async (_label, failure) => {
		call.mockRejectedValue(failure);
		renderResults();
		await advance(0);

		expect(screen.getByRole('alert')).toHaveTextContent(ERROR_TEXT);
		expect(logError).toHaveBeenCalledTimes(1);

		await advance(RETRY.INITIAL_DELAY_MS);
		expect(call).toHaveBeenCalledTimes(1);
	});
});
