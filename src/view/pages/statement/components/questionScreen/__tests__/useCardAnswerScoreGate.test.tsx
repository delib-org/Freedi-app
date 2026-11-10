import { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { Statement, StatementType } from '@freedi/shared-types';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { AnswerScoreGateContext, SharedAnswerScoreGate } from '../answerScoreGateContext';
import type { CanSeeScoreInput } from '../canSeeScore';
import { STAGE_RATING } from '@/helpers/questionStage';
import { useCardAnswerScoreGate } from '../useAnswerScoreGate';

jest.mock('@/controllers/hooks/reduxHooks', () => ({ useAppSelector: jest.fn() }));

const ANSWER = { statementId: 'a', statementType: StatementType.option } as Statement;

const INPUT: CanSeeScoreInput = {
	isHost: false,
	stage: STAGE_RATING,
	showLiveResults: true,
	isDeadlinePassed: false,
	ratingClosed: false,
	isOwnAnswer: false,
	hasRated: false,
};

function wrapperWith(shared: SharedAnswerScoreGate) {
	const Wrapper = ({ children }: { children: ReactNode }) => (
		<AnswerScoreGateContext.Provider value={shared}>{children}</AnswerScoreGateContext.Provider>
	);

	return Wrapper;
}

describe('useCardAnswerScoreGate', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		(useAppSelector as jest.Mock).mockReturnValue(undefined);
	});

	it('uses the card input inside its own card', () => {
		const wrapper = wrapperWith({ answerId: 'a', input: { ...INPUT, hasRated: true } });

		const { result } = renderHook(() => useCardAnswerScoreGate(ANSWER), { wrapper });

		expect(result.current).toEqual({ canSee: true, showRevealHint: false });
	});

	it('adds a rating just tapped, before the store catches up', () => {
		const wrapper = wrapperWith({ answerId: 'a', input: INPUT });

		const { result } = renderHook(
			() => useCardAnswerScoreGate(ANSWER, undefined, { hasRated: true }),
			{
				wrapper,
			},
		);

		expect(result.current.canSee).toBe(true);
	});

	it('keeps scores hidden while results are off, even after rating', () => {
		const wrapper = wrapperWith({
			answerId: 'a',
			input: { ...INPUT, showLiveResults: false, hasRated: true },
		});

		const { result } = renderHook(() => useCardAnswerScoreGate(ANSWER), { wrapper });

		expect(result.current.canSee).toBe(false);
	});

	it('does not take another card’s input', () => {
		const wrapper = wrapperWith({ answerId: 'other', input: { ...INPUT, hasRated: true } });

		const { result } = renderHook(() => useCardAnswerScoreGate(ANSWER), { wrapper });

		expect(result.current.canSee).toBe(false);
	});
});
