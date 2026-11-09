import { render, screen, fireEvent } from '@testing-library/react';
import { Statement, StatementType } from '@freedi/shared-types';
import TreeMessageNode from '../TreeMessageNode';

jest.mock('react-router', () => ({ useNavigate: () => jest.fn() }));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/controllers/hooks/useUserConfig', () => ({
	useUserConfig: () => ({ dir: 'ltr' }),
}));
jest.mock('@/controllers/hooks/reduxHooks', () => ({ useAppSelector: () => undefined }));
jest.mock('@/redux/statements/statementsSlice', () => ({
	statementSubscriptionSelector: () => () => undefined,
}));
jest.mock('@/controllers/general/helpers', () => ({
	isAuthorized: () => false,
	isStatementTypeAllowedAsChildren: () => false,
}));
jest.mock('@/controllers/hooks/useIsProcessHalted', () => ({
	useIsProcessHalted: () => ({ isHalted: false }),
}));
jest.mock('@/controllers/db/statements/changeStatementType', () => ({
	changeStatementType: jest.fn(),
}));
jest.mock('@/view/pages/statement/components/chat/components/input/StatementInputCont', () => ({
	handleAddStatement: jest.fn(),
}));
jest.mock('@/controllers/hooks/useAuthentication', () => ({
	useAuthentication: () => ({ user: undefined }),
}));
jest.mock('@/controllers/hooks/useStatementTypeDetection', () => ({
	useStatementTypeDetection: () => ({
		suggestedType: undefined,
		isVisible: false,
		dismiss: jest.fn(),
	}),
}));
jest.mock('@/controllers/hooks/useBookmark', () => ({
	useBookmark: () => ({ isBookmarked: false, toggle: jest.fn() }),
}));
jest.mock('../../StatementTypeIcon/StatementTypeIcon', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock('@/view/components/edit/EditableStatement', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock(
	'@/view/pages/statement/components/chat/components/chatMessageCard/ChatMessageMenu',
	() => ({ __esModule: true, default: () => null }),
);
jest.mock(
	'@/view/pages/statement/components/chat/components/chatMessageCard/TypeSuggestionBanner',
	() => ({ __esModule: true, default: () => null }),
);
jest.mock('@/view/components/icons/SendIcon', () => ({ __esModule: true, default: () => null }));
jest.mock('@/helpers/getCreatorDisplayName', () => ({ getCreatorDisplayName: () => '' }));
jest.mock('@/view/components/richHtml/RichHtmlContent', () => ({
	__esModule: true,
	default: ({ content }: { content: string }) => <span>{content}</span>,
}));
jest.mock('@/view/components/text/Text', () => ({
	__esModule: true,
	default: ({ description }: { description: string }) => <div>{description}</div>,
}));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

const makeStatement = (extra: Partial<Statement>): Statement =>
	({
		statementId: 's1',
		parentId: 'p1',
		statement: 'What should we do?',
		statementType: StatementType.question,
		createdAt: 1700000000000,
		...extra,
	}) as Statement;

const renderNode = (statement: Statement): void => {
	render(<TreeMessageNode statement={statement} parentStatement={undefined} hasChildren={false} />);
};

describe('TreeMessageNode question summary', () => {
	it('shows a closed Summary accordion on a question that has a summary', () => {
		renderNode(makeStatement({ summary: 'Most agree on X.' }));
		const toggle = screen.getByRole('button', { name: 'Summary' });

		expect(toggle).toHaveAttribute('aria-expanded', 'false');
		expect(screen.queryByText('Most agree on X.')).toBeNull();

		fireEvent.click(toggle);

		expect(screen.getByText('Most agree on X.')).toBeInTheDocument();
	});

	it('shows no accordion on a question without a summary', () => {
		renderNode(makeStatement({}));

		expect(screen.queryByRole('button', { name: 'Summary' })).toBeNull();
	});

	it('shows no accordion on a non-question even if it has a summary', () => {
		renderNode(makeStatement({ statementType: StatementType.statement, summary: 'Hidden' }));

		expect(screen.queryByRole('button', { name: 'Summary' })).toBeNull();
	});
});
