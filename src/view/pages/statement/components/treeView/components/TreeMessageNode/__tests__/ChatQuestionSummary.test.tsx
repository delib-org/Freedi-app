import { render, screen, fireEvent, act } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import ChatQuestionSummary from '../ChatQuestionSummary';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/view/components/text/Text', () => ({
	__esModule: true,
	default: ({ description }: { description: string }) => <div>{description}</div>,
}));

const SUMMARY = 'The group agrees on X.';

const withSummary = (extra: Partial<Statement> = {}): Statement =>
	({ statementId: 'q1', statement: 'Q', summary: SUMMARY, ...extra }) as Statement;

// jsdom has no layout, so fake the measurements the component reads.
const mockLayout = (scrollHeight: number, clientHeight: number): void => {
	jest.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(scrollHeight);
	jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(clientHeight);
};

const observers: Array<{ callback: () => void; disconnect: jest.Mock }> = [];

class StubResizeObserver {
	disconnect = jest.fn();
	observe = jest.fn();
	unobserve = jest.fn();
	constructor(callback: () => void) {
		observers.push({ callback, disconnect: this.disconnect });
	}
}

describe('ChatQuestionSummary', () => {
	beforeEach(() => {
		observers.length = 0;
		(global as unknown as { ResizeObserver: unknown }).ResizeObserver = StubResizeObserver;
	});

	afterEach(() => {
		jest.restoreAllMocks();
		delete (global as unknown as { ResizeObserver?: unknown }).ResizeObserver;
	});

	it('re-measures when the observed size changes', () => {
		mockLayout(40, 40);
		render(<ChatQuestionSummary statement={withSummary()} />);
		expect(screen.queryByRole('button')).toBeNull();

		mockLayout(120, 60);
		act(() => observers.forEach((o) => o.callback()));

		expect(screen.getByRole('button', { name: 'Read more' })).toBeInTheDocument();
	});

	it('disconnects the observer on expand and on unmount', () => {
		mockLayout(120, 60);
		const { unmount } = render(<ChatQuestionSummary statement={withSummary()} />);
		const first = observers.length;
		expect(first).toBeGreaterThan(0);

		fireEvent.click(screen.getByRole('button', { name: 'Read more' }));
		observers.slice(0, first).forEach((o) => expect(o.disconnect).toHaveBeenCalled());

		fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
		const second = observers.slice(first);
		expect(second.length).toBeGreaterThan(0);
		unmount();
		second.forEach((o) => expect(o.disconnect).toHaveBeenCalled());
	});

	it('renders nothing without a summary', () => {
		const { container } = render(<ChatQuestionSummary statement={withSummary({ summary: '' })} />);
		expect(container).toBeEmptyDOMElement();
		expect(screen.queryByRole('button')).toBeNull();
	});

	it('shows the label and the summary text', () => {
		mockLayout(40, 40);
		render(<ChatQuestionSummary statement={withSummary()} />);
		expect(screen.getByText('chatQuestion.answerLabel')).toBeInTheDocument();
		expect(screen.getByText(SUMMARY)).toBeInTheDocument();
	});

	it('hides "Read more" when the text is not cut off', () => {
		mockLayout(40, 40);
		render(<ChatQuestionSummary statement={withSummary()} />);
		expect(screen.queryByRole('button')).toBeNull();
	});

	it('expands and collapses when the text is cut off', () => {
		mockLayout(120, 60);
		render(<ChatQuestionSummary statement={withSummary()} />);

		const readMore = screen.getByRole('button', { name: 'Read more' });
		expect(readMore).toHaveAttribute('aria-expanded', 'false');

		fireEvent.click(readMore);
		const showLess = screen.getByRole('button', { name: 'Show less' });
		expect(showLess).toHaveAttribute('aria-expanded', 'true');

		fireEvent.click(showLess);
		expect(screen.getByRole('button', { name: 'Read more' })).toHaveAttribute(
			'aria-expanded',
			'false',
		);
	});

	it('does not pass the tap on to the card', () => {
		mockLayout(120, 60);
		const onCardClick = jest.fn();
		render(
			<div onClick={onCardClick}>
				<ChatQuestionSummary statement={withSummary()} />
			</div>,
		);
		fireEvent.click(screen.getByRole('button', { name: 'Read more' }));
		expect(onCardClick).not.toHaveBeenCalled();
	});

	it('marks an obsolete summary when expanded', () => {
		mockLayout(120, 60);
		render(
			<ChatQuestionSummary
				statement={withSummary({
					summarySelectedIds: ['a'],
					results: [{ statementId: 'b' }] as Statement['results'],
				})}
			/>,
		);
		expect(screen.queryByTestId('summary-obsolete')).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: 'Read more' }));
		expect(screen.getByTestId('summary-obsolete')).toBeInTheDocument();
	});
});
