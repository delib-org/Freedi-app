import { act, renderHook } from '@testing-library/react';
import { CreditAction, SourceApp } from '@freedi/shared-types';
import type { CreditTransaction } from '@freedi/shared-types';
import { STORAGE_KEYS, TIME } from '@/constants/common';
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

function rememberToasted(transactionId: string, userId = 'u1'): void {
	localStorage.setItem(`${STORAGE_KEYS.LAST_TOASTED_CREDIT}_${userId}`, transactionId);
}

describe('useCreditAnimation', () => {
	beforeEach(() => {
		mockRecentCredits = [];
		localStorage.clear();
	});

	it('stays silent on load when the newest credit was already toasted', () => {
		rememberToasted('tx-30');
		mockRecentCredits = fullList(30);
		const { result } = renderHook(() => useCreditAnimation());

		expect(result.current.toast).toBeNull();
	});

	describe('arriving on Home after earning a credit elsewhere', () => {
		it('toasts the credit on the first snapshot of someone new to Home', () => {
			mockRecentCredits = [credit(1)];
			const { result } = renderHook(() => useCreditAnimation());

			expect(result.current.toast).toEqual({ id: 'tx-1', amount: 10 });
		});

		it('does not repeat the toast on a reload or a second Home visit', () => {
			mockRecentCredits = [credit(1)];
			const firstVisit = renderHook(() => useCreditAnimation());
			expect(firstVisit.result.current.toast).toEqual({ id: 'tx-1', amount: 10 });
			firstVisit.unmount();

			const secondVisit = renderHook(() => useCreditAnimation());

			expect(secondVisit.result.current.toast).toBeNull();
		});

		it('toasts only a credit newer than the one last toasted', () => {
			rememberToasted('tx-1');
			mockRecentCredits = [credit(2), credit(1)];
			const { result } = renderHook(() => useCreditAnimation());

			expect(result.current.toast).toEqual({ id: 'tx-2', amount: 10 });
		});

		it('keeps the memory per user', () => {
			rememberToasted('tx-1', 'someone-else');
			mockRecentCredits = [credit(1)];
			const { result } = renderHook(() => useCreditAnimation());

			expect(result.current.toast).toEqual({ id: 'tx-1', amount: 10 });
		});

		it('stays silent for a first snapshot older than an hour', () => {
			mockRecentCredits = [credit(1, CreditAction.CREATE_OPTION, NOW - 2 * TIME.HOUR)];
			const { result } = renderHook(() => useCreditAnimation());

			expect(result.current.toast).toBeNull();
		});

		it('stays silent for a first snapshot of a rating', () => {
			mockRecentCredits = [credit(1, CreditAction.EVALUATE_OPTION)];
			const { result } = renderHook(() => useCreditAnimation());

			expect(result.current.toast).toBeNull();
		});
	});

	describe('when localStorage is blocked', () => {
		beforeEach(() => {
			jest.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
				throw new Error('blocked');
			});
			jest.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
				throw new Error('blocked');
			});
		});

		afterEach(() => jest.restoreAllMocks());

		it('stays silent on load, since a repeat could not be prevented', () => {
			mockRecentCredits = [credit(1)];
			const { result } = renderHook(() => useCreditAnimation());

			expect(result.current.toast).toBeNull();
		});

		it('still toasts a credit that arrives while Home is open', () => {
			mockRecentCredits = [credit(1)];
			const { result, rerender } = renderHook(() => useCreditAnimation());

			mockRecentCredits = [credit(2), credit(1)];
			rerender();

			expect(result.current.toast).toEqual({ id: 'tx-2', amount: 10 });
		});
	});

	it('toasts a new credit once the capped list is full', () => {
		rememberToasted('tx-30');
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

	it('treats an empty previous list as the baseline when the memory is unavailable', () => {
		expect(findCreditToToast([], [credit(1)], NOW)).toBeNull();
	});

	it('toasts from an empty previous list when nothing was toasted yet', () => {
		expect(findCreditToToast([], [credit(1)], NOW, null)).toEqual(credit(1));
	});

	it('stays silent when the newest shown credit is the one last toasted', () => {
		expect(
			findCreditToToast([], [credit(2, CreditAction.VOTE), credit(1)], NOW, 'tx-1'),
		).toBeNull();
	});

	it('never reaches below the last toasted credit', () => {
		expect(findCreditToToast([], [credit(3), credit(2), credit(1)], NOW, 'tx-2')).toEqual(
			credit(3),
		);
	});

	it('handles an empty list with nothing toasted', () => {
		expect(findCreditToToast([], [], NOW, null)).toBeNull();
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
