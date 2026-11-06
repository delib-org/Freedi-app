import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import SubGroupCardSummary from '../SubGroupCardSummary';
import { requestDiscussionSummary } from '@/controllers/db/summarization/summarizationController';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key, currentLanguage: 'en' }),
}));
jest.mock('@/view/components/text/Text', () => ({
	__esModule: true,
	default: ({ description }: { description: string }) => <div>{description}</div>,
}));
jest.mock('@/controllers/db/summarization/summarizationController', () => ({
	requestDiscussionSummary: jest.fn().mockResolvedValue({
		summary: 'Fresh selected-only summary',
		includeDivided: false,
		dividedCount: 0,
		generatedAt: 1700000000000,
	}),
	SummarizationNotReadyError: class extends Error {},
}));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

const statement = { statementId: 'q1', statement: 'Q' } as unknown as Statement;

describe('SubGroupCardSummary with no summary yet', () => {
	beforeEach(() => jest.clearAllMocks());

	it('tells members there is no summary and offers no button', () => {
		render(<SubGroupCardSummary statement={statement} summary="" />);
		expect(screen.getByText('No summary yet')).toBeInTheDocument();
		expect(screen.queryByRole('button')).toBeNull();
	});

	it('lets admins create the selected-options summary', async () => {
		render(<SubGroupCardSummary statement={statement} summary="" isAdmin />);
		fireEvent.click(screen.getByRole('button', { name: 'Summarize' }));
		await waitFor(() =>
			expect(requestDiscussionSummary).toHaveBeenCalledWith('q1', undefined, {
				includeDivided: false,
			}),
		);
		expect(await screen.findByText('Fresh selected-only summary')).toBeInTheDocument();
	});
});

describe('SubGroupCardSummary obsolete marker', () => {
	beforeEach(() => jest.clearAllMocks());

	const withSelection = (
		summarySelectedIds: string[] | undefined,
		resultIds: string[],
		includeDivided = false,
	): Statement =>
		({
			statementId: 'q1',
			statement: 'Q',
			summarySelectedIds,
			summaryIncludesDivided: includeDivided,
			results: resultIds.map((statementId) => ({ statementId })),
		}) as unknown as Statement;

	it('shows the note and an Update summary button when the selection changed', async () => {
		render(
			<SubGroupCardSummary
				statement={withSelection(['a'], ['a', 'b'], true)}
				summary="Old text"
				isAdmin
			/>,
		);
		expect(screen.getByTestId('summary-obsolete')).toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', { name: 'Update summary' }));
		await waitFor(() =>
			expect(requestDiscussionSummary).toHaveBeenCalledWith('q1', undefined, {
				includeDivided: true,
			}),
		);
		await waitFor(() => expect(screen.queryByTestId('summary-obsolete')).toBeNull());
	});

	it('shows no note when the selection is the same', () => {
		render(
			<SubGroupCardSummary statement={withSelection(['a', 'b'], ['b', 'a'])} summary="Text" />,
		);
		expect(screen.queryByTestId('summary-obsolete')).toBeNull();
	});

	it('shows no note for an old summary without a recorded selection', () => {
		render(<SubGroupCardSummary statement={withSelection(undefined, ['a'])} summary="Text" />);
		expect(screen.queryByTestId('summary-obsolete')).toBeNull();
	});
});
