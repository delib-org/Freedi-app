import { act, renderHook } from '@testing-library/react';
import { CreditAction, SourceApp } from '@freedi/shared-types';
import type { CreditTransaction } from '@freedi/shared-types';
import { TIME } from '@/constants/common';
import { findCreditToToast, useCreditAnimation } from '../useCreditAnimation';

let mockRecentCredits: CreditTransaction[] = [];

jest.mock('@/controllers/hooks/reduxHooks', () => ({
	useAppSelector: () => mockRecentCredits,
}));
jest.mock('@/redux/engagement/engagementSlice', () => ({ recentCreditsSelector: 'recentCredits' }));

const LISTENER_CAP = 20;
const NOW = Date.now();
/** Puts every serial a few seconds before NOW, a higher serial being newer. */
const RECENT_BASE = NOW - TIME.MINUTE;

function credit(
	serial: number,
	action: CreditAction = CreditAction.CREATE_OPTION,
	createdAt: number = RECENT_BASE + serial,
): CreditTransaction {
	return {
		transactionId: `tx-${serial}`,
		userId: 'u1',
		action,
		amount: 10,
		sourceApp: SourceApp.MAIN,
		createdAt,
	};
}

/** The capped newest-first list the listener delivers, ending at `newest`. */
function fullList(newest: number): CreditTransaction[] {
	return Array.from({ length: LISTENER_CAP }, (_, index) => credit(newest - index));
}

describe('useCreditAnimation', () => {
	beforeEach(() => {
		mockRecentCredits = [];
	});

	it('does not animate the first load', () => {
		mockRecentCredits = fullList(30);
		const { result } = renderHook(() => useCreditAnimation());

		expect(result.current.toast).toBeNull();
	});

	it('toasts a new credit once the capped list is full', () => {
		mockRecentCredits = fullList(30);
		const { result, rerender } = renderHook(() => useCreditAnimation());

		mockRecentCredits = fullList(31);
		rerender();

		expect(mockRecentCredits).toHaveLength(LISTENER_CAP);
		expect(result.current.toast).toEqual({ id: 'tx-31', amount: 10 });
	});

	it('clears the toast on dismiss', () => {
		mockRecentCredits = [credit(1)];
		const { result, rerender } = renderHook(() => useCreditAnimation());

		mockRecentCredits = [credit(2), credit(1)];
		rerender();
		act(() => result.current.dismissToast());

		expect(result.current.toast).toBeNull();
	});

	describe('cached snapshot followed by a server snapshot', () => {
		const daysAgo = NOW - 3 * TIME.DAY;
		const cached = credit(1, CreditAction.CREATE_OPTION, daysAgo - TIME.HOUR);

		it('stays silent for a credit from days ago that only the server knew', () => {
			mockRecentCredits = [cached];
			const { result, rerender } = renderHook(() => useCreditAnimation());

			mockRecentCredits = [credit(2, CreditAction.CREATE_OPTION, daysAgo), cached];
			rerender();

			expect(result.current.toast).toBeNull();
		});

		it('still toasts an answer added minutes ago, for someone returning to Home', () => {
			mockRecentCredits = [cached];
			const { result, rerender } = renderHook(() => useCreditAnimation());

			mockRecentCredits = [credit(2, CreditAction.CREATE_OPTION, NOW - TIME.MINUTE), cached];
			rerender();

			expect(result.current.toast).toEqual({ id: 'tx-2', amount: 10 });
		});
	});
});

describe('findCreditToToast', () => {
	it.each([
		CreditAction.EVALUATE_OPTION,
		CreditAction.VOTE,
		CreditAction.MC_PARTICIPATION,
		CreditAction.DAILY_LOGIN,
		CreditAction.STREAK_BONUS,
	])('stays silent for %s', (action) => {
		expect(findCreditToToast([credit(1)], [credit(2, action), credit(1)], NOW)).toBeNull();
	});

	it('toasts the newest shown credit when a silent one arrived with it', () => {
		const answer = credit(2);

		expect(
			findCreditToToast(
				[credit(1)],
				[credit(3, CreditAction.EVALUATE_OPTION), answer, credit(1)],
				NOW,
			),
		).toBe(answer);
	});

	it('stays silent when the list has not changed', () => {
		expect(findCreditToToast([credit(1)], [credit(1)], NOW)).toBeNull();
	});

	it('stays silent when the newest credit is removed and an older one slides in', () => {
		expect(findCreditToToast([credit(5), credit(4)], [credit(4), credit(3)], NOW)).toBeNull();
	});

	it('treats an empty previous list as the baseline', () => {
		expect(findCreditToToast([], [credit(1)], NOW)).toBeNull();
	});

	it('handles an emptied list', () => {
		expect(findCreditToToast([credit(1)], [], NOW)).toBeNull();
	});

	describe('age limit', () => {
		const older = credit(1, CreditAction.CREATE_OPTION, NOW - 2 * TIME.HOUR);

		it('stays silent for a credit older than an hour', () => {
			const stale = credit(2, CreditAction.CREATE_OPTION, NOW - TIME.HOUR - 1);

			expect(findCreditToToast([older], [stale, older], NOW)).toBeNull();
		});

		it('toasts a credit exactly an hour old', () => {
			const onTheLimit = credit(2, CreditAction.CREATE_OPTION, NOW - TIME.HOUR);

			expect(findCreditToToast([older], [onTheLimit, older], NOW)).toBe(onTheLimit);
		});
	});
});
