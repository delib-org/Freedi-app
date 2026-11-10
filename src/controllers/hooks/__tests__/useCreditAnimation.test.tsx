import { act, renderHook } from '@testing-library/react';
import { CreditAction, SourceApp } from '@freedi/shared-types';
import type { CreditTransaction } from '@freedi/shared-types';
import { findCreditToToast, useCreditAnimation } from '../useCreditAnimation';

let mockRecentCredits: CreditTransaction[] = [];

jest.mock('@/controllers/hooks/reduxHooks', () => ({
	useAppSelector: () => mockRecentCredits,
}));
jest.mock('@/redux/engagement/engagementSlice', () => ({ recentCreditsSelector: 'recentCredits' }));

const LISTENER_CAP = 20;

function credit(
	serial: number,
	action: CreditAction = CreditAction.CREATE_OPTION,
	amount = 10,
): CreditTransaction {
	return {
		transactionId: `tx-${serial}`,
		userId: 'u1',
		action,
		amount,
		sourceApp: SourceApp.MAIN,
		createdAt: serial,
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
});

describe('findCreditToToast', () => {
	it.each([
		CreditAction.EVALUATE_OPTION,
		CreditAction.VOTE,
		CreditAction.MC_PARTICIPATION,
		CreditAction.DAILY_LOGIN,
		CreditAction.STREAK_BONUS,
	])('stays silent for %s', (action) => {
		expect(findCreditToToast([credit(1)], [credit(2, action), credit(1)])).toBeNull();
	});

	it('toasts the newest shown credit when a silent one arrived with it', () => {
		const answer = credit(2);

		expect(
			findCreditToToast([credit(1)], [credit(3, CreditAction.EVALUATE_OPTION), answer, credit(1)]),
		).toBe(answer);
	});

	it('stays silent when the list has not changed', () => {
		expect(findCreditToToast([credit(1)], [credit(1)])).toBeNull();
	});

	it('stays silent when the newest credit is removed and an older one slides in', () => {
		expect(findCreditToToast([credit(5), credit(4)], [credit(4), credit(3)])).toBeNull();
	});

	it('treats an empty previous list as the first load', () => {
		expect(findCreditToToast([], [credit(1)])).toBeNull();
	});

	it('handles an emptied list', () => {
		expect(findCreditToToast([credit(1)], [])).toBeNull();
	});
});
