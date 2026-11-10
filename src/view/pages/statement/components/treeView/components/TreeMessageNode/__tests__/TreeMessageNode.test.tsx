import { render, screen } from '@testing-library/react';
import { Statement, StatementType } from '@freedi/shared-types';
import TreeMessageNode from '../TreeMessageNode';

jest.mock('@/view/components/unreadBadge/UnreadMessagesBadge', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock(
	'@/view/pages/statement/components/chat/components/statementChatMore/StatementChatMore',
	() => ({
		__esModule: true,
		default: ({ statement, sheetSubject }: { statement: Statement; sheetSubject?: string }) => (
			<button type="button" data-testid="chat-button" data-subject={sheetSubject}>
				{statement.statementId}
			</button>
		),
	}),
);
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
let mockCanPropose = false;

jest.mock('@/controllers/general/helpers', () => ({
	isAuthorized: () => mockCanPropose,
	isStatementTypeAllowedAsChildren: () => mockCanPropose,
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

const renderNode = (statement: Statement, opensChatSheet = false, hasChildren = false): void => {
	render(
		<TreeMessageNode
			statement={statement}
			parentStatement={mockCanPropose ? makeStatement({ statementId: 'p1' }) : undefined}
			hasChildren={hasChildren}
			opensChatSheet={opensChatSheet}
		/>,
	);
};

describe('TreeMessageNode question summary', () => {
	it('shows the Answer preview on a question that has a summary', () => {
		renderNode(makeStatement({ summary: 'Most agree on X.' }));

		expect(screen.getByText('chatQuestion.answerLabel')).toBeInTheDocument();
		expect(screen.getByText('Most agree on X.')).toBeInTheDocument();
	});

	it('shows no Answer preview on a question without a summary', () => {
		renderNode(makeStatement({}));

		expect(screen.queryByText('chatQuestion.answerLabel')).toBeNull();
	});

	it('shows no Answer preview on a non-question even if it has a summary', () => {
		renderNode(makeStatement({ statementType: StatementType.statement, summary: 'Hidden' }));

		expect(screen.queryByText('chatQuestion.answerLabel')).toBeNull();
	});
});

describe('TreeMessageNode chat button', () => {
	const message = makeStatement({ statementType: StatementType.statement });

	it('shows one chat button with the message wording and no reply button on the Discussion tab', () => {
		renderNode(message, true);

		expect(screen.getAllByTestId('chat-button')).toHaveLength(1);
		expect(screen.getByTestId('chat-button')).toHaveAttribute('data-subject', 'message');
		expect(screen.queryByRole('button', { name: 'reply' })).toBeNull();
	});

	it('keeps the reply button and no chat button in tree view', () => {
		renderNode(message, false);

		expect(screen.getByRole('button', { name: 'reply' })).toBeInTheDocument();
		expect(screen.queryByTestId('chat-button')).toBeNull();
	});

	it('keeps the bookmark action beside the chat button', () => {
		renderNode(message, true);

		expect(screen.getByRole('button', { name: 'Bookmark' })).toBeInTheDocument();
	});
});

describe('TreeMessageNode action order', () => {
	const names = (): string[] =>
		screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent ?? '');

	afterEach(() => {
		mockCanPropose = false;
	});

	it('orders a question card Drill down, chat, bookmark', () => {
		renderNode(makeStatement({}), true);

		expect(names()).toEqual(['Drill down', 's1', 'Bookmark']);
	});

	it('shows only chat and bookmark on a message without replies', () => {
		renderNode(makeStatement({ statementType: StatementType.statement }), true);

		expect(names()).toEqual(['s1', 'Bookmark']);
	});

	it('shows Drill down as an icon button first on a message with replies', () => {
		renderNode(makeStatement({ statementType: StatementType.statement }), true, true);

		expect(names()).toEqual(['Drill down', 's1', 'Bookmark']);
		expect(screen.getByRole('button', { name: 'Drill down' })).toHaveTextContent('jump_to_element');
	});

	it('puts Make this a proposal after the icon buttons', () => {
		mockCanPropose = true;
		renderNode(makeStatement({ statementType: StatementType.statement }), true, true);

		expect(names()).toEqual(['Drill down', 's1', 'Bookmark', 'Make this a proposal']);
	});
});
