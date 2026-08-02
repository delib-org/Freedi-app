/**
 * Tests for useOptimisticVotes - the vote tallies that move before the server
 * confirms, then hand back to the server numbers.
 */
import { act, renderHook } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import { useOptimisticVotes, NO_VOTE } from '../useOptimisticVotes';

const mockCreator = { uid: 'user-1', displayName: 'Voter' };
let mockVote: { statementId: string } | undefined;

const mockDispatch = jest.fn();
const mockSetVoteToDB = jest.fn().mockResolvedValue(undefined);

jest.mock('@/controllers/db/vote/setVote', () => ({
	setVoteToDB: (...args: unknown[]) => mockSetVoteToDB(...args),
}));

jest.mock('@/controllers/hooks/reduxHooks', () => ({
	useAppDispatch: () => mockDispatch,
	useAppSelector: () => mockVote,
}));

jest.mock('@/controllers/hooks/useAuthentication', () => ({
	useAuthentication: () => ({ creator: mockCreator }),
}));

const makeQuestion = (selections: Record<string, number>): Statement =>
	({
		statementId: 'question-1',
		selections,
	}) as unknown as Statement;

const makeOption = (statementId: string): Statement =>
	({
		statementId,
		parentId: 'question-1',
	}) as unknown as Statement;

describe('useOptimisticVotes', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockVote = undefined;
	});

	it('should report the server tallies when nothing is pending', () => {
		const { result } = renderHook(() => useOptimisticVotes(makeQuestion({ a: 2, b: 1 })));

		expect(result.current.selectionsById).toEqual({ a: 2, b: 1 });
		expect(result.current.totalVotes).toBe(3);
		expect(result.current.votedOptionId).toBe(NO_VOTE);
	});

	it('should exclude the "none" bucket from the total', () => {
		const { result } = renderHook(() => useOptimisticVotes(makeQuestion({ a: 2, b: 1, none: 5 })));

		expect(result.current.selectionsById.none).toBeUndefined();
		expect(result.current.totalVotes).toBe(3);
	});

	it('should treat a missing selections map as no votes', () => {
		const { result } = renderHook(() => useOptimisticVotes(makeQuestion(undefined as never)));

		expect(result.current.totalVotes).toBe(0);
	});

	it('should raise the chosen option and the total straight away', async () => {
		const { result } = renderHook(() => useOptimisticVotes(makeQuestion({ a: 2, b: 1 })));

		await act(async () => {
			await result.current.castVote(makeOption('a'));
		});

		expect(result.current.selectionsById).toEqual({ a: 3, b: 1 });
		expect(result.current.totalVotes).toBe(4);
	});

	it('should move the count off the previous option in the same render', async () => {
		mockVote = { statementId: 'b' };
		const { result } = renderHook(() => useOptimisticVotes(makeQuestion({ a: 2, b: 1 })));

		await act(async () => {
			await result.current.castVote(makeOption('a'));
		});

		expect(result.current.selectionsById).toEqual({ a: 3, b: 0 });
		// Switching a vote keeps the total the same.
		expect(result.current.totalVotes).toBe(3);
	});

	it('should withdraw the vote when the same option is pressed again', async () => {
		mockVote = { statementId: 'a' };
		const { result } = renderHook(() => useOptimisticVotes(makeQuestion({ a: 2, b: 1 })));

		await act(async () => {
			await result.current.castVote(makeOption('a'));
		});

		expect(result.current.selectionsById).toEqual({ a: 1, b: 1 });
		expect(result.current.totalVotes).toBe(2);
		expect(mockDispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				payload: { parentId: 'question-1', optionId: NO_VOTE, userId: 'user-1' },
			}),
		);
	});

	it('should never show a negative tally', async () => {
		mockVote = { statementId: 'a' };
		const { result } = renderHook(() => useOptimisticVotes(makeQuestion({ a: 0, b: 1 })));

		await act(async () => {
			await result.current.castVote(makeOption('a'));
		});

		expect(result.current.selectionsById.a).toBe(0);
	});

	it('should write the vote to the DB', async () => {
		const { result } = renderHook(() => useOptimisticVotes(makeQuestion({ a: 2 })));
		const option = makeOption('a');

		await act(async () => {
			await result.current.castVote(option);
		});

		expect(mockSetVoteToDB).toHaveBeenCalledWith(option, mockCreator);
	});

	it('should hand back to the server numbers once they catch up', async () => {
		const { result, rerender } = renderHook(({ question }) => useOptimisticVotes(question), {
			initialProps: { question: makeQuestion({ a: 2, b: 1 }) },
		});

		await act(async () => {
			await result.current.castVote(makeOption('a'));
		});
		expect(result.current.selectionsById).toEqual({ a: 3, b: 1 });

		// Server aggregation lands - and it disagrees, because someone else voted too.
		await act(async () => {
			rerender({ question: makeQuestion({ a: 4, b: 1 }) });
		});

		expect(result.current.selectionsById).toEqual({ a: 4, b: 1 });
	});

	it('should drop the optimistic tally if the server never confirms', async () => {
		jest.useFakeTimers();
		try {
			const { result } = renderHook(() => useOptimisticVotes(makeQuestion({ a: 2, b: 1 })));

			await act(async () => {
				await result.current.castVote(makeOption('a'));
			});
			expect(result.current.selectionsById).toEqual({ a: 3, b: 1 });

			act(() => {
				jest.advanceTimersByTime(10_000);
			});

			expect(result.current.selectionsById).toEqual({ a: 2, b: 1 });
		} finally {
			jest.useRealTimers();
		}
	});

	it('should do nothing without a statement', async () => {
		const { result } = renderHook(() => useOptimisticVotes(undefined));

		await act(async () => {
			await result.current.castVote(makeOption('a'));
		});

		expect(mockSetVoteToDB).not.toHaveBeenCalled();
		expect(result.current.totalVotes).toBe(0);
	});
});
