import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { QuestionStep, Statement, StatementType } from '@freedi/shared-types';
import VotingThankYou from '../VotingThankYou';

const mockDispatch = jest.fn();
const mockGetStatementFromDB = jest.fn();
let mockStatement: Statement | undefined;
let mockOptions: Statement[] = [];

jest.mock('react-redux', () => ({
	useDispatch: () => mockDispatch,
	useSelector: (selector: () => unknown) => selector(),
}));
jest.mock('@/redux/statements/statementsSlice', () => ({
	setStatement: (statement: Statement) => ({ type: 'setStatement', payload: statement }),
	statementSelector: () => () => mockStatement,
	statementOptionsSelector: () => () => mockOptions,
}));
jest.mock('@/controllers/db/statements/getStatement', () => ({
	getStatementFromDB: (...args: unknown[]) => mockGetStatementFromDB(...args),
}));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

function CurrentPath() {
	return <div data-testid="path">{useLocation().pathname}</div>;
}

function renderPage() {
	return render(
		<MemoryRouter initialEntries={['/statement/q1/thank-you']}>
			<Routes>
				<Route path="/statement/:statementId/thank-you" element={<VotingThankYou />} />
				<Route path="*" element={<CurrentPath />} />
			</Routes>
		</MemoryRouter>,
	);
}

const question = {
	statementId: 'q1',
	statementType: StatementType.question,
	questionSettings: { currentStep: QuestionStep.voting },
} as unknown as Statement;

describe('VotingThankYou', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockStatement = question;
		mockOptions = [];
		mockGetStatementFromDB.mockResolvedValue(undefined);
	});

	it('shows no personal contact details', () => {
		const { container } = renderPage();

		expect(container.textContent).not.toMatch(/gmail|\+972/);
		expect(container.querySelector('a[href^="mailto:"], a[href^="tel:"]')).toBeNull();
	});

	it('says what happens next at the current stage', () => {
		renderPage();

		expect(screen.getByTestId('thank-you-next-step')).toHaveTextContent('thankYou.next.voting');
		expect(mockGetStatementFromDB).not.toHaveBeenCalled();
	});

	it('goes back to the question', () => {
		renderPage();
		fireEvent.click(screen.getByRole('button', { name: 'Back to the question' }));

		expect(screen.getByTestId('path')).toHaveTextContent('/statement/q1');
	});

	it('goes Home', () => {
		renderPage();
		fireEvent.click(screen.getByRole('button', { name: 'Go to Home' }));

		expect(screen.getByTestId('path')).toHaveTextContent('/home');
	});

	it('loads the question when the page was opened directly', async () => {
		mockStatement = undefined;
		mockGetStatementFromDB.mockResolvedValue(question);
		renderPage();

		expect(screen.getByTestId('thank-you-next-step')).toHaveTextContent('thankYou.next.unknown');
		await waitFor(() =>
			expect(mockDispatch).toHaveBeenCalledWith({ type: 'setStatement', payload: question }),
		);
	});

	it('stays usable when the question cannot be loaded', async () => {
		mockStatement = undefined;
		renderPage();

		await waitFor(() => expect(mockGetStatementFromDB).toHaveBeenCalledWith('q1'));
		expect(mockDispatch).not.toHaveBeenCalled();
		expect(screen.getByRole('button', { name: 'Go to Home' })).toBeInTheDocument();
	});
});
