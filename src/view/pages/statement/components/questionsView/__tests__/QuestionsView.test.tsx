import React from 'react';
import { render, screen } from '@testing-library/react';
import { Role, Statement, StatementType } from '@freedi/shared-types';
import QuestionsView from '../QuestionsView';
import { StatementContext } from '../../../StatementCont';

const mockDispatch = jest.fn();
let mockRole: Role | undefined;
let mockQuestions: Statement[] = [];

jest.mock('react-redux', () => ({
	useDispatch: () => mockDispatch,
	useSelector: (selector: unknown) =>
		typeof selector === 'function' ? (selector as () => unknown)() : undefined,
}));
jest.mock('@/redux/statements/statementsSlice', () => ({
	questionsSelector: () => () => mockQuestions,
	statementSubscriptionSelector: () => () => (mockRole ? { role: mockRole } : undefined),
}));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/view/components/subGroupCard/SubGroupCard', () => ({
	__esModule: true,
	default: ({ statement }: { statement: Statement }) => (
		<div data-testid="sub-group-card">{statement.statement}</div>
	),
}));

const group = { statementId: 'g1', statement: 'Group', statementType: StatementType.group };

function makeQuestion(id: string): Statement {
	return {
		statementId: id,
		statement: `Question ${id}`,
		statementType: StatementType.question,
		parentId: 'g1',
	} as Statement;
}

function renderView() {
	return render(
		<StatementContext.Provider
			value={{ statement: group as Statement } as React.ContextType<typeof StatementContext>}
		>
			<QuestionsView />
		</StatementContext.Provider>,
	);
}

describe('QuestionsView', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockQuestions = [makeQuestion('q1'), makeQuestion('q2')];
	});

	it.each([
		['an admin', Role.admin],
		['the creator', Role.creator],
		['a member', Role.member],
		['a visitor', undefined],
	])('shows no add button of its own to %s (the nav "+" is the only one)', (_label, role) => {
		mockRole = role;
		renderView();

		expect(screen.queryByRole('button')).toBeNull();
		expect(screen.queryByText('Add a question')).toBeNull();
		expect(screen.queryByLabelText('Add a question')).toBeNull();
		expect(screen.queryByRole('menu')).toBeNull();
		expect(screen.getAllByTestId('sub-group-card')).toHaveLength(2);
	});

	it('still shows the onboarding when the group has no questions, without any add button', () => {
		mockRole = Role.admin;
		mockQuestions = [];
		renderView();

		expect(screen.getByText('questionsOnboarding.addQuestion')).toBeInTheDocument();
		expect(screen.queryByRole('button')).toBeNull();
	});

	it('never opens the new-statement modal by itself', () => {
		mockRole = Role.admin;
		renderView();

		expect(mockDispatch).not.toHaveBeenCalled();
	});
});
