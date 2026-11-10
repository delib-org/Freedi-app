import { renderHook, waitFor } from '@testing-library/react';
import { EvaluationUI, QuestionStep, Statement, StatementType, Vote } from '@freedi/shared-types';
import { getOwnVote } from '@/controllers/db/vote/getVotes';
import { questionUsesVotes, useLoadOwnVote } from '../useLoadOwnVote';

const mockDispatch = jest.fn();
let mockUid: string | undefined = 'u1';

jest.mock('@/controllers/db/vote/getVotes', () => ({ getOwnVote: jest.fn() }));
jest.mock('@/controllers/hooks/reduxHooks', () => ({ useAppDispatch: () => mockDispatch }));
jest.mock('react-redux', () => ({
	useSelector: () => (mockUid ? { uid: mockUid } : undefined),
}));
jest.mock('@/redux/creator/creatorSlice', () => ({ creatorSelector: jest.fn() }));
jest.mock('@/redux/vote/votesSlice', () => ({
	setVoteToStore: (payload: unknown) => ({ type: 'setVote', payload }),
}));

const getOwnVoteMock = getOwnVote as jest.MockedFunction<typeof getOwnVote>;

function question(id: string, overrides: Partial<Statement> = {}): Statement {
	return {
		statementId: id,
		statementType: StatementType.question,
		evaluationSettings: { evaluationUI: EvaluationUI.voting },
		...overrides,
	} as Statement;
}

function vote(parentId: string, statementId: string): Vote {
	return { voteId: `v-${parentId}`, parentId, statementId, userId: 'u1' } as Vote;
}

describe('useLoadOwnVote', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockUid = 'u1';
		getOwnVoteMock.mockImplementation(async (parentId) => vote(parentId, `${parentId}-answer`));
	});

	it('loads the vote of every question opened in the session, not only the first', async () => {
		const { rerender } = renderHook(({ statement }) => useLoadOwnVote(statement), {
			initialProps: { statement: question('q1') },
		});
		await waitFor(() => expect(mockDispatch).toHaveBeenCalledTimes(1));

		rerender({ statement: question('q2') });
		await waitFor(() => expect(mockDispatch).toHaveBeenCalledTimes(2));

		expect(getOwnVoteMock.mock.calls).toEqual([
			['q1', 'u1'],
			['q2', 'u1'],
		]);
		expect(mockDispatch).toHaveBeenLastCalledWith({
			type: 'setVote',
			payload: { parentId: 'q2', optionId: 'q2-answer', userId: 'u1' },
		});
	});

	it('does not read again when the same question re-renders', async () => {
		const { rerender } = renderHook(({ statement }) => useLoadOwnVote(statement), {
			initialProps: { statement: question('q1') },
		});
		await waitFor(() => expect(mockDispatch).toHaveBeenCalledTimes(1));
		rerender({ statement: question('q1') });
		expect(getOwnVoteMock).toHaveBeenCalledTimes(1);
	});

	it('drops the answer of a question the person already left', async () => {
		let resolveFirst: (value: Vote) => void = () => undefined;
		getOwnVoteMock.mockImplementationOnce(
			() =>
				new Promise<Vote>((resolve) => {
					resolveFirst = resolve;
				}),
		);
		const { rerender } = renderHook(({ statement }) => useLoadOwnVote(statement), {
			initialProps: { statement: question('q1') },
		});
		rerender({ statement: question('q2') });
		await waitFor(() => expect(mockDispatch).toHaveBeenCalledTimes(1));
		resolveFirst(vote('q1', 'late'));
		await Promise.resolve();
		expect(mockDispatch).toHaveBeenCalledTimes(1);
	});

	it('stores nothing when the person has not voted', async () => {
		getOwnVoteMock.mockResolvedValue(undefined);
		renderHook(() => useLoadOwnVote(question('q1')));
		await waitFor(() => expect(getOwnVoteMock).toHaveBeenCalled());
		await Promise.resolve();
		expect(mockDispatch).not.toHaveBeenCalled();
	});

	it('reads nothing on a question that does not vote, or without a signed-in person', () => {
		renderHook(() =>
			useLoadOwnVote(
				question('q1', {
					evaluationSettings: { evaluationUI: EvaluationUI.suggestions },
				} as Partial<Statement>),
			),
		);
		mockUid = undefined;
		renderHook(() => useLoadOwnVote(question('q2')));
		expect(getOwnVoteMock).not.toHaveBeenCalled();
	});
});

describe('questionUsesVotes', () => {
	const suggestions = { evaluationSettings: { evaluationUI: EvaluationUI.suggestions } };

	it('is true for the voting UI or the voting step, on questions only', () => {
		expect(questionUsesVotes(question('q'))).toBe(true);
		expect(
			questionUsesVotes(
				question('q', {
					...suggestions,
					questionSettings: { currentStep: QuestionStep.voting },
				} as Partial<Statement>),
			),
		).toBe(true);
		expect(questionUsesVotes(question('q', suggestions as Partial<Statement>))).toBe(false);
		expect(questionUsesVotes(question('q', { statementType: StatementType.group }))).toBe(false);
		expect(questionUsesVotes(undefined)).toBe(false);
	});
});
