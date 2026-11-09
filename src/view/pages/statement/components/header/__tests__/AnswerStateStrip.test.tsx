import React from 'react';
import { render, screen } from '@testing-library/react';
import { Statement, StatementType } from '@freedi/shared-types';
import AnswerStateStrip from '../AnswerStateStrip';
import { getAnswerState } from '../answerState';

let mockParent: Statement | undefined;

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/controllers/hooks/reduxHooks', () => ({
	useAppSelector: () => mockParent,
}));
jest.mock('@/redux/statements/statementsSlice', () => ({
	statementSelector: () => () => undefined,
}));

function makeStatement(statementType: StatementType, statementId = 'a1'): Statement {
	return { statementId, parentId: 'p1', statementType } as Statement;
}

function makeParent(chosenIds: string[]): Statement {
	return {
		statementId: 'p1',
		results: chosenIds.map((id) => ({ statementId: id })),
	} as unknown as Statement;
}

describe('getAnswerState', () => {
	it('is notChosen for an answer that is not in the parent results', () => {
		expect(getAnswerState(makeStatement(StatementType.option), makeParent(['x']))).toBe(
			'notChosen',
		);
	});

	it('is chosen for an answer in the parent results', () => {
		expect(getAnswerState(makeStatement(StatementType.option), makeParent(['a1']))).toBe('chosen');
	});

	it('is none for a question, a group and a missing statement', () => {
		expect(getAnswerState(makeStatement(StatementType.question), makeParent(['a1']))).toBe('none');
		expect(getAnswerState(makeStatement(StatementType.group), undefined)).toBe('none');
		expect(getAnswerState(undefined, undefined)).toBe('none');
	});

	it('is notChosen while the parent is not loaded', () => {
		expect(getAnswerState(makeStatement(StatementType.option), undefined)).toBe('notChosen');
	});
});

describe('AnswerStateStrip', () => {
	beforeEach(() => {
		mockParent = undefined;
	});

	it('shows the not-chosen label', () => {
		mockParent = makeParent([]);
		render(<AnswerStateStrip statement={makeStatement(StatementType.option)} />);

		expect(screen.getByTestId('answer-state-strip').dataset.state).toBe('notChosen');
		expect(screen.getByText('answerStrip.notChosen')).toBeTruthy();
	});

	it('shows the chosen label', () => {
		mockParent = makeParent(['a1']);
		render(<AnswerStateStrip statement={makeStatement(StatementType.option)} />);

		expect(screen.getByTestId('answer-state-strip').dataset.state).toBe('chosen');
		expect(screen.getByText('answerStrip.chosen')).toBeTruthy();
	});

	it('renders nothing for a question', () => {
		render(<AnswerStateStrip statement={makeStatement(StatementType.question)} />);

		expect(screen.queryByTestId('answer-state-strip')).toBeNull();
	});

	it('shows not chosen, not a crash, when the parent has not loaded', () => {
		render(<AnswerStateStrip statement={makeStatement(StatementType.option)} />);

		expect(screen.getByTestId('answer-state-strip').dataset.state).toBe('notChosen');
	});
});
