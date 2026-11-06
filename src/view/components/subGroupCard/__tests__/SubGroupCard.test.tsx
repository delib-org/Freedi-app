import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Statement, StatementType } from '@freedi/shared-types';
import SubGroupCard from '../SubGroupCard';
import { requestDiscussionSummary } from '@/controllers/db/summarization/summarizationController';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key, currentLanguage: 'en' }),
}));
jest.mock('../SubGroupCardVM', () => ({
	__esModule: true,
	default: () => ({ Icon: null, text: 'Question title' }),
}));
jest.mock('@/controllers/statementRouter/useRouteTargets', () => ({
	useRouteTargets: () => [],
}));
jest.mock('@/view/components/menu/Menu', () => ({ __esModule: true, default: () => null }));
jest.mock('@/view/components/menu/MenuOption', () => ({ __esModule: true, default: () => null }));
jest.mock('@/view/components/statementRouter/RoutePicker/RoutePicker', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock(
	'@/view/pages/statement/components/chat/components/statementChatMore/StatementChatMore',
	() => ({ __esModule: true, default: () => null }),
);
jest.mock('@/view/components/text/Text', () => ({
	__esModule: true,
	default: ({ description }: { description: string }) => <div>{description}</div>,
}));
jest.mock('@/controllers/db/summarization/summarizationController', () => ({
	requestDiscussionSummary: jest.fn().mockResolvedValue({
		summary: 'New summary with division',
		includeDivided: true,
		dividedCount: 2,
		generatedAt: 1700000000000,
	}),
	SummarizationNotReadyError: class extends Error {},
}));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

function buildQuestion(extra: Partial<Statement> = {}): Statement {
	return {
		statementId: 'q1',
		statement: 'Question title',
		statementType: StatementType.question,
		results: [{ statementId: 'r1', parentId: 'q1', statement: 'Chosen result' }],
		...extra,
	} as unknown as Statement;
}

function renderCard(statement: Statement, isAdmin?: boolean): void {
	render(
		<MemoryRouter>
			<SubGroupCard statement={statement} isAdmin={isAdmin} />
		</MemoryRouter>,
	);
}

describe('SubGroupCard summary vs results', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('shows the selected results when there is no summary', () => {
		renderCard(buildQuestion());

		expect(screen.getByText('Chosen result')).toBeTruthy();
		expect(screen.queryByText('Add what the group is divided on')).toBeNull();
	});

	it('treats a whitespace-only summary as no summary', () => {
		renderCard(buildQuestion({ summary: '   ' }));

		expect(screen.getByText('Chosen result')).toBeTruthy();
	});

	it('shows the summary instead of the results when it exists', () => {
		renderCard(buildQuestion({ summary: 'The group agreed on X' }));

		expect(screen.getByText('The group agreed on X')).toBeTruthy();
		expect(screen.queryByText('Chosen result')).toBeNull();
	});

	it('hides the divided button from non-admins', () => {
		renderCard(buildQuestion({ summary: 'Summary text' }));

		expect(screen.queryByText('Add what the group is divided on')).toBeNull();
	});

	it('lets admins regenerate the summary with divided options', async () => {
		renderCard(buildQuestion({ summary: 'Summary text' }), true);

		fireEvent.click(screen.getByText('Add what the group is divided on'));

		await waitFor(() =>
			expect(requestDiscussionSummary).toHaveBeenCalledWith('q1', undefined, {
				includeDivided: true,
			}),
		);
		expect(await screen.findByText('New summary with division')).toBeTruthy();
		expect(screen.getByText('Show selected options only')).toBeTruthy();
	});

	it('offers the way back when the summary already includes divided', async () => {
		(requestDiscussionSummary as jest.Mock).mockResolvedValueOnce({
			summary: 'Selected only again',
			includeDivided: false,
			dividedCount: 0,
			generatedAt: 1700000000000,
		});
		renderCard(buildQuestion({ summary: 'Summary text', summaryIncludesDivided: true }), true);

		fireEvent.click(screen.getByText('Show selected options only'));

		await waitFor(() =>
			expect(requestDiscussionSummary).toHaveBeenCalledWith('q1', undefined, {
				includeDivided: false,
			}),
		);
		expect(await screen.findByText('Selected only again')).toBeTruthy();
		expect(screen.getByText('Add what the group is divided on')).toBeTruthy();
	});

	it('says the group is not split when asked to add divided and none exist', async () => {
		(requestDiscussionSummary as jest.Mock).mockResolvedValueOnce({
			summary: 'Same summary',
			includeDivided: false,
			dividedCount: 0,
			generatedAt: 1700000000000,
		});
		renderCard(buildQuestion({ summary: 'Summary text' }), true);

		fireEvent.click(screen.getByText('Add what the group is divided on'));

		expect(await screen.findByText('The group is not split on any option')).toBeTruthy();
		expect(screen.getByText('Add what the group is divided on')).toBeTruthy();
	});

	it('shows only a short preview and expands to the full text', () => {
		const long = '## Heading\n\n' + 'The group agreed on a long list of things. '.repeat(10);
		renderCard(buildQuestion({ summary: long }));

		expect(screen.queryByText('## Heading', { exact: false })).toBeNull();
		fireEvent.click(screen.getByText('Read more'));
		expect(screen.getByText(/## Heading/)).toBeTruthy();
		fireEvent.click(screen.getByText('Show less'));
		expect(screen.getByText('Read more')).toBeTruthy();
	});

	it('has no Read more for a short summary', () => {
		renderCard(buildQuestion({ summary: 'Short one' }));

		expect(screen.queryByText('Read more')).toBeNull();
	});

	it('shows when the summary was generated', () => {
		renderCard(buildQuestion({ summary: 'Summary text', summaryGeneratedAt: 1700000000000 }));

		expect(screen.getByText(/Summary from/)).toBeTruthy();
	});
});
