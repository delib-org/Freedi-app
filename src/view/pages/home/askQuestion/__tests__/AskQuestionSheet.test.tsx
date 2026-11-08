import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, AnyAction } from '@reduxjs/toolkit';
import { Statement, StatementType } from '@freedi/shared-types';
import AskQuestionSheet, { AskSpace } from '../AskQuestionSheet';

const mockNavigate = jest.fn();
const mockCreate = jest.fn();

jest.mock('react-router', () => ({ useNavigate: () => mockNavigate }));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key, currentLanguage: 'en' }),
}));
jest.mock('@/controllers/hooks/useAuthentication', () => ({
	useAuthentication: () => ({ user: { uid: 'u1', displayName: 'Dana' } }),
}));
jest.mock('@/controllers/hooks/useUserConfig', () => ({
	useUserConfig: () => ({ currentLanguage: 'en' }),
}));
jest.mock('@/models/questionTypeDefaults', () => ({
	getDefaultQuestionType: () => 'simple',
}));
jest.mock('@/view/components/atomic/molecules/Sheet', () => ({
	Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/view/pages/statement/components/addStatement/useCreateStatementFlow', () => ({
	textToParagraphs: () => undefined,
}));
jest.mock('@/controllers/db/statements/createStatementWithSubscription', () => ({
	createStatementWithSubscription: (params: unknown) => mockCreate(params),
}));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

interface CreateParams {
	newStatementParent: Statement | 'top';
	title: string;
	newStatement: Partial<Statement>;
	dispatch: (action: AnyAction) => void;
}

function makeStatement(id: string, title: string, lastUpdate = 1): Statement {
	return {
		statementId: id,
		statement: title,
		statementType: StatementType.group,
		lastUpdate,
	} as Statement;
}

function renderSheet(spaces: AskSpace[], currentSpaceId?: string) {
	const store = configureStore({
		reducer: {
			statements: (state: { statements: Statement[] } = { statements: [] }, action: AnyAction) =>
				action.type === 'test/add'
					? { statements: [...state.statements, action.payload as Statement] }
					: state,
		},
	});
	const onClose = jest.fn();
	render(
		<Provider store={store}>
			<AskQuestionSheet isOpen onClose={onClose} spaces={spaces} currentSpaceId={currentSpaceId} />
		</Provider>,
	);

	return { onClose };
}

/** A fake write that also puts the statement in the store, like the real one. */
function succeedWith(id: string) {
	return (params: CreateParams) => {
		params.dispatch({
			type: 'test/add',
			payload: makeStatement(id, params.title),
		} as AnyAction);

		return Promise.resolve(id);
	};
}

async function submit() {
	await act(async () => {
		fireEvent.click(screen.getByTestId('ask-question-submit'));
	});
}

const trip: AskSpace = {
	id: 'space-1',
	title: 'Trip',
	statement: makeStatement('space-1', 'Trip', 5),
};

describe('AskQuestionSheet', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('shows the picker with No space and New space even when the user has no spaces', () => {
		renderSheet([]);

		expect(screen.getByTestId('ask-space-top')).toHaveAttribute('aria-checked', 'true');
		expect(screen.getByTestId('ask-space-__new-space__')).toBeInTheDocument();
	});

	it('asks without a space by default (parent top)', async () => {
		mockCreate.mockImplementation(succeedWith('q1'));
		const { onClose } = renderSheet([trip]);

		fireEvent.change(screen.getByTestId('ask-question-text'), { target: { value: 'Where to?' } });
		await submit();

		expect(mockCreate).toHaveBeenCalledTimes(1);
		expect(mockCreate.mock.calls[0][0].newStatementParent).toBe('top');
		expect(onClose).toHaveBeenCalled();
		expect(mockNavigate).toHaveBeenCalledWith('/statement/q1');
	});

	it('asks inside an existing space', async () => {
		mockCreate.mockImplementation(succeedWith('q1'));
		renderSheet([trip]);

		fireEvent.click(screen.getByTestId('ask-space-space-1'));
		fireEvent.change(screen.getByTestId('ask-question-text'), { target: { value: 'Where to?' } });
		await submit();

		expect(mockCreate.mock.calls[0][0].newStatementParent).toBe(trip.statement);
	});

	it('preselects the space the person is in', () => {
		renderSheet([trip], 'space-1');

		expect(screen.getByTestId('ask-space-space-1')).toHaveAttribute('aria-checked', 'true');
	});

	it('creates the space first, then the question inside it', async () => {
		mockCreate.mockImplementation((params: CreateParams) =>
			succeedWith(params.newStatement.statementType === StatementType.group ? 's9' : 'q9')(params),
		);
		renderSheet([]);

		fireEvent.click(screen.getByTestId('ask-space-__new-space__'));
		expect(screen.getByTestId('ask-space-name')).toHaveFocus();
		fireEvent.change(screen.getByTestId('ask-space-name'), { target: { value: 'Garden' } });
		fireEvent.change(screen.getByTestId('ask-question-text'), {
			target: { value: 'What to plant?' },
		});
		await submit();

		expect(mockCreate).toHaveBeenCalledTimes(2);
		const [spaceCall, questionCall] = mockCreate.mock.calls.map((c) => c[0] as CreateParams);
		expect(spaceCall.newStatementParent).toBe('top');
		expect(spaceCall.newStatement.statementType).toBe(StatementType.group);
		expect(spaceCall.title).toBe('Garden');
		expect((questionCall.newStatementParent as Statement).statementId).toBe('s9');
		expect(questionCall.newStatement.statementType).toBe(StatementType.question);
		expect(mockNavigate).toHaveBeenCalledWith('/statement/q9');
	});

	it('requires a space name for a new space', () => {
		renderSheet([]);

		fireEvent.click(screen.getByTestId('ask-space-__new-space__'));
		fireEvent.change(screen.getByTestId('ask-question-text'), {
			target: { value: 'What to plant?' },
		});

		expect(screen.getByTestId('ask-question-submit')).toBeDisabled();
	});

	it('keeps the new space when the question fails and retries only the question', async () => {
		let questionAttempts = 0;
		mockCreate.mockImplementation((params: CreateParams) => {
			if (params.newStatement.statementType === StatementType.group) {
				return succeedWith('s9')(params);
			}
			questionAttempts += 1;

			return questionAttempts === 1 ? Promise.reject(new Error('offline')) : Promise.resolve('q9');
		});
		renderSheet([]);

		fireEvent.click(screen.getByTestId('ask-space-__new-space__'));
		fireEvent.change(screen.getByTestId('ask-space-name'), { target: { value: 'Garden' } });
		fireEvent.change(screen.getByTestId('ask-question-text'), {
			target: { value: 'What to plant?' },
		});
		await submit();

		expect(
			screen.getByText('The space was created, but the question was not saved. Try again.'),
		).toBeInTheDocument();
		expect(screen.getByTestId('ask-space-s9')).toHaveAttribute('aria-checked', 'true');
		expect(screen.getByTestId('ask-question-text')).toHaveValue('What to plant?');

		await submit();

		await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/statement/q9'));
		const groupWrites = mockCreate.mock.calls.filter(
			(c) => (c[0] as CreateParams).newStatement.statementType === StatementType.group,
		);
		expect(groupWrites).toHaveLength(1);
	});

	it('shows a generic error and keeps the text when the space itself fails', async () => {
		mockCreate.mockRejectedValue(new Error('offline'));
		renderSheet([]);

		fireEvent.click(screen.getByTestId('ask-space-__new-space__'));
		fireEvent.change(screen.getByTestId('ask-space-name'), { target: { value: 'Garden' } });
		fireEvent.change(screen.getByTestId('ask-question-text'), {
			target: { value: 'What to plant?' },
		});
		await submit();

		expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
		expect(screen.getByTestId('ask-question-text')).toHaveValue('What to plant?');
		expect(mockNavigate).not.toHaveBeenCalled();
	});
});
