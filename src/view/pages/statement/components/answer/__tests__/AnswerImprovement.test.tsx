import type { ContextType } from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { EvaluationUI, Statement, StatementType } from '@freedi/shared-types';
import { renderWithProviders } from '@/test-utils/test-utils';
import { statementsSlice } from '@/redux/statements/statementsSlice';
import AnswerImprovement, { showsAnswerImprovement } from '../AnswerImprovement';
import { StatementContext } from '../../../StatementCont';

const navigate = jest.fn();
const createImprovedAnswer = jest.fn();
let halted = false;
let authorized = true;
let parentHost = false;

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (k: string) => k, dir: 'ltr' }),
}));
jest.mock('react-router', () => ({
	...jest.requireActual('react-router'),
	useNavigate: () => navigate,
}));
jest.mock('@/controllers/hooks/useIsProcessHalted', () => ({
	useIsProcessHalted: () => ({ isHalted: halted }),
}));
jest.mock('@/controllers/hooks/useAuthorization', () => ({
	useAuthorization: () => ({ isAuthorized: authorized, isAdmin: parentHost }),
}));
jest.mock('@/controllers/db/statements/createImprovedAnswer', () => ({
	createImprovedAnswer: (...a: unknown[]) => createImprovedAnswer(...a),
}));

const parent = {
	statementId: 'q1',
	statement: 'Q',
	statementType: StatementType.question,
	parentId: 'top',
	topParentId: 'q1',
	evaluationSettings: { evaluationUI: EvaluationUI.suggestions },
	statementSettings: { enableAddEvaluationOption: true },
} as Statement;

function answer(overrides: Partial<Statement> = {}): Statement {
	return {
		statementId: 'a1',
		statement: 'Two planters',
		statementType: StatementType.option,
		parentId: 'q1',
		topParentId: 'q1',
		...overrides,
	} as Statement;
}

function renderCard(statement = answer(), question = parent) {
	const context = { statement } as unknown as ContextType<typeof StatementContext>;

	return renderWithProviders(
		<MemoryRouter>
			<StatementContext.Provider value={context}>
				<AnswerImprovement />
			</StatementContext.Provider>
		</MemoryRouter>,
		{
			preloadedState: {
				statements: { ...statementsSlice.getInitialState(), statements: [question, statement] },
			} as never,
		},
	);
}

describe('showsAnswerImprovement', () => {
	it('is only for an answer that is not a merged group, on Discussion', () => {
		expect(showsAnswerImprovement(answer(), 'chat')).toBe(true);
		expect(showsAnswerImprovement(answer(), 'options')).toBe(false);
		expect(showsAnswerImprovement(answer({ isCluster: true }), 'chat')).toBe(false);
		expect(showsAnswerImprovement(answer({ statementType: StatementType.question }), 'chat')).toBe(
			false,
		);
		expect(showsAnswerImprovement(undefined, 'chat')).toBe(false);
	});
});

describe('AnswerImprovement', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		halted = false;
		authorized = true;
		parentHost = false;
	});

	it('offers the form to a member when the question lets participants add answers', () => {
		renderCard();
		expect(screen.getByTestId('answer-improvement')).toHaveClass('tone-card--peach');
		expect(screen.getByText('improve.propose')).toBeInTheDocument();
	});

	it('hides the form when the question is halted, and when a member may not add', () => {
		halted = true;
		const { unmount } = renderCard();
		expect(screen.queryByText('improve.propose')).toBeNull();
		unmount();

		halted = false;
		authorized = false;
		renderCard();
		expect(screen.queryByText('improve.propose')).toBeNull();
	});

	it('uses the parent question permission when submissions are closed', () => {
		const closed = {
			...parent,
			statementSettings: { enableAddEvaluationOption: false },
		} as Statement;
		const { unmount } = renderCard(answer(), closed);
		expect(screen.queryByText('improve.propose')).toBeNull();
		unmount();
		parentHost = true;
		renderCard(answer(), closed);
		expect(screen.getByText('improve.propose')).toBeInTheDocument();
	});

	it('links back to the answers this one was improved from', () => {
		renderCard(
			answer({
				paragraphs: [
					{
						paragraphId: 'p1',
						type: 'paragraph',
						content: 'why',
						order: 0,
						sourceStatementId: 'a0',
					},
				],
			} as Partial<Statement>),
		);
		expect(screen.getByRole('link', { name: /improve\.compareSource/ })).toHaveAttribute(
			'href',
			'/statement/a0?tab=chat',
		);
	});

	it('creates the revised answer and opens it', async () => {
		createImprovedAnswer.mockResolvedValue({ statementId: 'a2' });
		renderCard();
		fireEvent.change(screen.getByLabelText('improve.wording'), {
			target: { value: 'Two movable planters' },
		});
		fireEvent.change(screen.getByLabelText('improve.reason'), {
			target: { value: 'Maintenance' },
		});
		fireEvent.submit(screen.getByTestId('answer-improvement-form'));
		await waitFor(() => expect(navigate).toHaveBeenCalledWith('/statement/a2?tab=chat'));
		expect(createImprovedAnswer).toHaveBeenCalledWith(
			expect.objectContaining({ text: 'Two movable planters', reason: 'Maintenance' }),
		);
	});

	it('reports a failure without leaving the page', async () => {
		createImprovedAnswer.mockRejectedValue(new Error('nope'));
		renderCard();
		fireEvent.change(screen.getByLabelText('improve.wording'), { target: { value: 'New' } });
		fireEvent.change(screen.getByLabelText('improve.reason'), { target: { value: 'r' } });
		fireEvent.submit(screen.getByTestId('answer-improvement-form'));
		await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('improve.failed'));
		expect(navigate).not.toHaveBeenCalled();
	});
});
