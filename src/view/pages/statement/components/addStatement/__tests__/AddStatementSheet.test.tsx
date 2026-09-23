import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Statement, StatementType } from '@freedi/shared-types';
import AddStatementSheet, { allowedIntents } from '../AddStatementSheet';
import { initialFlowState } from '../createStatementFlow';

const flow = {
	state: { ...initialFlowState },
	config: { preCheck: false, multiSplit: false, similarity: false },
	parentId: 'q1',
	setDraft: jest.fn(),
	submit: jest.fn(),
	preCheck: { publish: jest.fn(), close: jest.fn() },
	multi: { confirm: jest.fn(), dismiss: jest.fn(), cancel: jest.fn() },
	similarity: { support: jest.fn(), continueOwn: jest.fn(), back: jest.fn() },
	retry: jest.fn(),
	abandon: jest.fn(),
};

jest.mock('../useCreateStatementFlow', () => ({ useCreateStatementFlow: () => flow }));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (k: string) => k, dir: 'ltr' }),
}));
jest.mock('react-router', () => ({
	useNavigate: () => jest.fn(),
	useLocation: () => ({ pathname: '/statement/q1/options' }),
}));
jest.mock('@/services/analytics', () => ({
	uxAnalytics: { addAnswerStarted: jest.fn() },
}));
jest.mock('../../popperHebbian/refinery/IdeaRefineryModal', () => ({
	__esModule: true,
	default: () => <div data-testid="refinery" />,
}));
jest.mock('@/view/components/multiSuggestion', () => ({
	MultiSuggestionPreviewModal: () => <div data-testid="split-preview" />,
}));

const question = (settings: Record<string, boolean> = {}) =>
	({
		statementId: 'q1',
		statement: 'How do we calm traffic?',
		statementType: StatementType.question,
		statementSettings: settings,
	}) as unknown as Statement;

function renderSheet(props: Partial<ComponentProps<typeof AddStatementSheet>> = {}) {
	return render(
		<AddStatementSheet
			isOpen
			onClose={jest.fn()}
			parentStatement={question()}
			intent="answer"
			origin="bar"
			{...props}
		/>,
	);
}

describe('allowedIntents', () => {
	it('top level offers question and space; a question offers answer and question', () => {
		expect(allowedIntents('top')).toEqual(['question', 'group']);
		expect(allowedIntents(question())).toEqual(['answer', 'question']);
	});

	it('an option only takes questions, and allowedTypes narrows further', () => {
		const option = { ...question(), statementType: StatementType.option } as Statement;
		expect(allowedIntents(option)).toEqual(['question']);
		expect(allowedIntents(question(), [StatementType.option])).toEqual(['answer']);
	});
});

describe('AddStatementSheet', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		flow.state = { ...initialFlowState };
		flow.config = { preCheck: false, multiSplit: false, similarity: false };
		document.body.classList.remove('modal-open');
	});

	it('titles the sheet by intent and disables submit while the draft is empty', () => {
		renderSheet();
		expect(screen.getByRole('dialog')).toHaveAccessibleName('question.sheet.answerTo');
		expect(document.getElementById('add-statement-submit')).toBeDisabled();
	});

	it('uses the question wording and the space wording', () => {
		const first = renderSheet({ intent: 'question' });
		expect(screen.getByRole('dialog')).toHaveAccessibleName('question.sheet.questionFor');
		first.unmount();
		renderSheet({ intent: 'group', parentStatement: 'top' });
		expect(screen.getByRole('dialog')).toHaveAccessibleName('question.sheet.newSpace');
	});

	it('offers "ask a follow-up instead" only when the host allows follow-up questions', () => {
		const first = renderSheet();
		expect(screen.queryByTestId('add-followup-instead')).not.toBeInTheDocument();
		first.unmount();
		renderSheet({ parentStatement: question({ enableAddNewSubQuestionsButton: true }) });
		fireEvent.click(screen.getByTestId('add-followup-instead'));
		expect(screen.getByRole('dialog')).toHaveAccessibleName('question.sheet.questionFor');
	});

	it('submits with the button and with Ctrl+Enter once there is a title', () => {
		flow.state = { ...initialFlowState, draft: { title: 'Bike lanes', description: '' } };
		renderSheet();
		fireEvent.click(document.getElementById('add-statement-submit') as HTMLElement);
		fireEvent.keyDown(screen.getByTestId('add-statement-form'), { key: 'Enter', ctrlKey: true });
		fireEvent.keyDown(screen.getByTestId('add-statement-form'), { key: 'Enter' });
		expect(flow.submit).toHaveBeenCalledTimes(2);
	});

	it('shows similar answers inline with "support this instead"', () => {
		flow.state = {
			...initialFlowState,
			step: 'similarity',
			similar: [{ statementId: 'a1', statement: 'Bikes', totalEvaluators: 3 } as Statement],
		};
		renderSheet();
		fireEvent.click(document.getElementById('support-instead-a1') as HTMLElement);
		expect(flow.similarity.support).toHaveBeenCalledWith(
			expect.objectContaining({ statementId: 'a1' }),
		);
		fireEvent.click(document.getElementById('continue-mine') as HTMLElement);
		expect(flow.similarity.continueOwn).toHaveBeenCalled();
	});

	it('renders the refinery during the pre-check step and the split chip when splits are offered', () => {
		flow.state = {
			...initialFlowState,
			step: 'structuredDebatePreCheck',
			draft: { title: 'x', description: '' },
		};
		renderSheet();
		expect(screen.getByTestId('refinery')).toBeInTheDocument();

		flow.state = {
			...initialFlowState,
			step: 'multiSplit',
			splits: [
				{ title: 'A', description: '' },
				{ title: 'B', description: '' },
			],
		};
		renderSheet();
		expect(screen.getByText('question.sheet.splitChip')).toBeInTheDocument();
		expect(screen.getByTestId('split-preview')).toBeInTheDocument();
	});

	it('closing reports an abandon through the flow', () => {
		const onClose = jest.fn();
		renderSheet({ onClose });
		fireEvent.keyDown(document, { key: 'Escape' });
		expect(flow.abandon).toHaveBeenCalled();
		expect(onClose).toHaveBeenCalled();
	});
});
