import type { ContextType } from 'react';
import { render, screen } from '@testing-library/react';
import { Statement, StatementType } from '@freedi/shared-types';
import { useSelector } from 'react-redux';
import StagePage from '../StagePage';
import { StatementContext } from '../../../../StatementCont';

jest.mock('react-redux', () => ({ useSelector: jest.fn() }));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/redux/statements/statementsSlice', () => ({
	statementOptionsSelector: (id: string) => `options-of-${id}`,
}));
jest.mock('../../../evaluations/components/suggestionCards/SuggestionCards', () => ({
	__esModule: true,
	default: () => <div data-testid="answers-list" />,
}));
jest.mock('../../../vote/StatementVote', () => ({
	__esModule: true,
	default: () => <div data-testid="vote" />,
}));
jest.mock('../../../clustering/Clustering', () => ({
	__esModule: true,
	default: () => <div data-testid="clustering" />,
}));
jest.mock('../../../nav/bottom/StatementBottomNav', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock('../../../../StatementCont', () => {
	const { createContext } = jest.requireActual('react');

	return { StatementContext: createContext({}) };
});

const question = {
	statementId: 'q1',
	statementType: StatementType.question,
} as unknown as Statement;

const NO_ANSWERS_KEY = 'No answers yet';
const ADD_STEP_KEY = 'solutionsOnboarding.addSolution';

function renderWith(options: Partial<Statement>[], canAddAnswer: boolean) {
	(useSelector as jest.Mock).mockReturnValue(options);

	return render(
		<StatementContext.Provider
			value={{ statement: question } as unknown as ContextType<typeof StatementContext>}
		>
			<StagePage canAddAnswer={canAddAnswer} />
		</StatementContext.Provider>,
	);
}

describe('StagePage empty state', () => {
	it('asks the options selector, so a chat message does not count as an answer', () => {
		renderWith([], true);

		expect(useSelector).toHaveBeenCalledWith('options-of-q1');
		expect(screen.getByText(ADD_STEP_KEY)).toBeInTheDocument();
		expect(screen.queryByTestId('answers-list')).not.toBeInTheDocument();
	});

	it('shows the answers once there is one', () => {
		renderWith([{ statementId: 'a1' }], true);

		expect(screen.getByTestId('answers-list')).toBeInTheDocument();
		expect(screen.queryByText(ADD_STEP_KEY)).not.toBeInTheDocument();
	});

	it('shows only "No answers yet" when the person cannot add', () => {
		renderWith([], false);

		expect(screen.getByText(NO_ANSWERS_KEY)).toBeInTheDocument();
		expect(screen.queryByText(ADD_STEP_KEY)).not.toBeInTheDocument();
		expect(screen.queryByText('solutionsOnboarding.convertFromDiscussion')).not.toBeInTheDocument();
	});
});
