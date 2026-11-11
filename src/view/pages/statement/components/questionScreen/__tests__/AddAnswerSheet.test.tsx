import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import AddAnswerSheet from '../AddAnswerSheet';
import { initialFlowState } from '../../addStatement/createStatementFlow';

const flow = {
	state: { ...initialFlowState },
	config: { preCheck: false, multiSplit: false, similarity: false },
	setDraft: jest.fn(),
	submit: jest.fn(),
	preCheck: { publish: jest.fn(), close: jest.fn() },
	multi: { confirm: jest.fn(), dismiss: jest.fn(), cancel: jest.fn() },
	similarity: { support: jest.fn(), continueOwn: jest.fn(), back: jest.fn() },
	retry: jest.fn(),
	abandon: jest.fn(),
};

let mockOnDone: (createdIds: string[]) => void = () => undefined;

jest.mock('../../addStatement/useCreateStatementFlow', () => ({
	useCreateStatementFlow: (options: { onDone: (createdIds: string[]) => void }) => {
		mockOnDone = options.onDone;

		return flow;
	},
}));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/services/analytics', () => ({ uxAnalytics: { addAnswerStarted: jest.fn() } }));
jest.mock('@/view/components/atomic/molecules/Sheet/Sheet', () => ({
	__esModule: true,
	default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/view/components/multiSuggestion', () => ({
	MultiSuggestionPreviewModal: () => null,
}));
jest.mock('../../popperHebbian/refinery/IdeaRefineryModal', () => ({
	__esModule: true,
	default: () => null,
}));

const statement = { statementId: 'q1' } as unknown as Statement;
const HINT = 'add-answer-similar-hint';

function renderSheet(): void {
	render(<AddAnswerSheet statement={statement} onClose={jest.fn()} onAnswerAdded={jest.fn()} />);
}

describe('AddAnswerSheet', () => {
	beforeEach(() => {
		flow.state = { ...initialFlowState };
		flow.config = { preCheck: false, multiSplit: false, similarity: false };
	});

	it('does not promise a similarity check that will not run', () => {
		renderSheet();

		expect(screen.queryByTestId(HINT)).not.toBeInTheDocument();
	});

	it('shows the hint when the check is on', () => {
		flow.config = { ...flow.config, similarity: true };
		renderSheet();

		expect(screen.getByTestId(HINT)).toBeInTheDocument();
	});

	it('shows the moderator message with the draft still open', () => {
		flow.state = { ...initialFlowState, rejection: 'Please rephrase' };
		renderSheet();

		expect(screen.getByRole('alert')).toHaveTextContent('Please rephrase');
		expect(screen.getByTestId('add-answer-text')).toBeInTheDocument();
	});

	it('reports the last created answer and closes', () => {
		const onClose = jest.fn();
		const onAnswerAdded = jest.fn();
		render(
			<AddAnswerSheet statement={statement} onClose={onClose} onAnswerAdded={onAnswerAdded} />,
		);

		mockOnDone(['a1', 'a2']);

		expect(onAnswerAdded).toHaveBeenCalledWith('a2');
		expect(onClose).toHaveBeenCalled();
	});

	it('closes without reporting when a similar answer was supported instead', () => {
		const onClose = jest.fn();
		const onAnswerAdded = jest.fn();
		render(
			<AddAnswerSheet statement={statement} onClose={onClose} onAnswerAdded={onAnswerAdded} />,
		);

		mockOnDone([]);

		expect(onAnswerAdded).not.toHaveBeenCalled();
		expect(onClose).toHaveBeenCalled();
	});
});
