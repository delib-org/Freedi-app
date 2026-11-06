import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Statement, StatementType } from '@freedi/shared-types';
import SubGroupCard from '../SubGroupCard';
import { requestDiscussionSummary } from '@/controllers/db/summarization/summarizationController';

let mockIsAdmin = false;

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/controllers/hooks/useEditPermission', () => ({
	useEditPermission: () => ({ isAdmin: mockIsAdmin }),
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
	requestDiscussionSummary: jest.fn().mockResolvedValue({}),
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

function renderCard(statement: Statement): void {
	render(
		<MemoryRouter>
			<SubGroupCard statement={statement} />
		</MemoryRouter>,
	);
}

describe('SubGroupCard summary vs results', () => {
	beforeEach(() => {
		mockIsAdmin = false;
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
		mockIsAdmin = true;
		renderCard(buildQuestion({ summary: 'Summary text' }));

		fireEvent.click(screen.getByText('Add what the group is divided on'));

		await waitFor(() =>
			expect(requestDiscussionSummary).toHaveBeenCalledWith('q1', undefined, {
				includeDivided: true,
			}),
		);
	});
});
