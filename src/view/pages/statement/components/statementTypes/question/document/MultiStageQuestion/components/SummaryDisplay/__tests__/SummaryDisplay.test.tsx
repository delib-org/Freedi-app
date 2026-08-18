import { render, screen, fireEvent } from '@testing-library/react';
import SummaryDisplay from '../SummaryDisplay';

// The controller reaches Firestore; the collapse/expand behaviour under test
// never writes, so the module is stubbed rather than initialised.
jest.mock('@/controllers/db/summarization/summarizationController', () => ({
	updateStatementSummary: jest.fn(),
}));

// Text pulls in react-markdown, which ships ESM that this jest transform does
// not take. What matters here is which text reaches the page, not how the
// markdown is rendered, so it becomes a plain passthrough.
jest.mock('@/view/components/text/Text', () => ({
	__esModule: true,
	default: ({ description }: { description?: string }) => <div>{description}</div>,
}));

const SUMMARY = `## The Answer in Brief

The group agreed to hold **shorter meetings**, weekly rather than daily, and to
publish an agenda the day before so nobody arrives unprepared.

## What Was Agreed

- Meetings run 25 minutes
- An agenda lands 24 hours ahead`;

describe('SummaryDisplay', () => {
	it('collapses to a prose teaser, with no markdown and no dialog', () => {
		render(<SummaryDisplay summary={SUMMARY} />);

		// Section labels and markdown syntax are stripped; the teaser opens on
		// what the group agreed. Two lines of it is a CSS clamp, so the element
		// legitimately holds more text than is painted.
		const teaser = screen.getByText(/The group agreed to hold shorter meetings/);
		expect(teaser.textContent).not.toMatch(/[#*]/);
		expect(teaser.textContent).not.toContain('The Answer in Brief');
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
	});

	it('opens the full summary in a dialog on Read more, and closes again', () => {
		render(<SummaryDisplay summary={SUMMARY} />);

		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

		fireEvent.click(screen.getByRole('button', { name: 'Read more' }));

		const dialog = screen.getByRole('dialog');
		expect(dialog).toBeInTheDocument();
		expect(dialog).toHaveTextContent('An agenda lands 24 hours ahead');

		fireEvent.click(screen.getByRole('button', { name: 'Close' }));
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
	});

	it('closes on Escape', () => {
		render(<SummaryDisplay summary={SUMMARY} />);
		fireEvent.click(screen.getByRole('button', { name: 'Read more' }));

		fireEvent.keyDown(document, { key: 'Escape' });
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
	});

	it('offers no Read more when the summary already fits', () => {
		render(<SummaryDisplay summary="We agreed to meet less often." />);

		expect(screen.getByText('We agreed to meet less often.')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Read more' })).not.toBeInTheDocument();
	});

	it('renders nothing without a summary', () => {
		const { container } = render(<SummaryDisplay summary={undefined} />);
		expect(container).toBeEmptyDOMElement();
	});
});
