import { render, screen, fireEvent } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import ChatQuestionSummary from '../ChatQuestionSummary';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/view/components/text/Text', () => ({
	__esModule: true,
	default: ({ description }: { description: string }) => <div>{description}</div>,
}));

const withSummary = (extra: Partial<Statement> = {}): Statement =>
	({ statementId: 'q1', statement: 'Q', summary: 'The group agrees on X.', ...extra }) as Statement;

describe('ChatQuestionSummary', () => {
	it('renders nothing without a summary', () => {
		const { container } = render(<ChatQuestionSummary statement={withSummary({ summary: '' })} />);
		expect(container).toBeEmptyDOMElement();
		expect(screen.queryByRole('button')).toBeNull();
	});

	it('is closed by default', () => {
		render(<ChatQuestionSummary statement={withSummary()} />);
		expect(screen.getByRole('button', { name: 'Summary' })).toHaveAttribute(
			'aria-expanded',
			'false',
		);
		expect(screen.queryByText('The group agrees on X.')).toBeNull();
	});

	it('opens on press and shows the summary', () => {
		render(<ChatQuestionSummary statement={withSummary()} />);
		fireEvent.click(screen.getByRole('button', { name: 'Summary' }));
		expect(screen.getByRole('button', { name: 'Summary' })).toHaveAttribute(
			'aria-expanded',
			'true',
		);
		expect(screen.getByText('The group agrees on X.')).toBeInTheDocument();
	});

	it('marks an obsolete summary when open', () => {
		render(
			<ChatQuestionSummary
				statement={withSummary({
					summarySelectedIds: ['a'],
					results: [{ statementId: 'b' }] as Statement['results'],
				})}
			/>,
		);
		fireEvent.click(screen.getByRole('button', { name: 'Summary' }));
		expect(screen.getByTestId('summary-obsolete')).toBeInTheDocument();
	});
});
