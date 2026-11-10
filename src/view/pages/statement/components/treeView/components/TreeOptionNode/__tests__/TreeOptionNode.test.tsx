import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import TreeOptionNode from '../TreeOptionNode';

const mockEvaluation = jest.fn();

jest.mock('../TreeOptionNode.module.scss', () => ({
	__esModule: true,
	default: new Proxy({}, { get: (_target, key) => key }),
}));
jest.mock('@/view/components/unreadBadge/UnreadMessagesBadge', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock(
	'@/view/pages/statement/components/chat/components/statementChatMore/StatementChatMore',
	() => ({
		__esModule: true,
		default: ({
			statement: node,
			sheetSubject,
		}: {
			statement: Statement;
			sheetSubject?: string;
		}) => (
			<button type="button" data-testid="chat-button" data-subject={sheetSubject}>
				{node.statementId}
			</button>
		),
	}),
);
jest.mock('react-router', () => ({ useNavigate: () => jest.fn() }));
jest.mock('@/view/pages/statement/components/questionScreen/useAnswerScoreGate', () => ({
	useAnswerScoreGate: () => ({ canSee: true, showRevealHint: false }),
}));
jest.mock('@/controllers/hooks/reduxHooks', () => ({ useAppSelector: () => undefined }));
jest.mock('@/redux/statements/statementsSlice', () => ({
	statementSubscriptionSelector: () => () => undefined,
	statementsSelector: () => undefined,
}));
jest.mock('@/controllers/general/helpers', () => ({ isAuthorized: () => false }));
jest.mock('@/view/pages/statement/components/chat/components/input/StatementInputCont', () => ({
	handleAddStatement: jest.fn(),
}));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (text: string) => text }),
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
	() => ({
		__esModule: true,
		default: () => null,
	}),
);
jest.mock('@/view/pages/statement/components/evaluations/components/evaluation/Evaluation', () => ({
	__esModule: true,
	default: (props: Record<string, unknown>) => {
		mockEvaluation(props);

		return <div data-testid="evaluation">{props.footerSlot as ReactNode}</div>;
	},
}));
jest.mock('@/controllers/hooks/useBookmark', () => ({
	useBookmark: () => ({ isBookmarked: false, toggle: jest.fn() }),
}));
jest.mock('@/controllers/hooks/useAuthorization', () => ({
	useAuthorization: () => ({ isAdmin: false }),
}));
jest.mock('@/controllers/db/integration/integrationController', () => ({
	regenerateSynthesisProposal: jest.fn(),
	reverseIntegration: jest.fn(),
}));
jest.mock('@/view/components/icons/SendIcon', () => ({ __esModule: true, default: () => null }));
jest.mock('@/view/pages/statement/components/joining/JoinButtons', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock('@/view/components/richHtml/RichHtmlContent', () => ({
	__esModule: true,
	default: () => null,
}));

const statement = {
	statementId: 's1',
	parentId: 'p1',
	statement: 'an option',
} as unknown as Statement;

describe('TreeOptionNode', () => {
	it('renders its evaluation with the face labels hidden', () => {
		render(<TreeOptionNode statement={statement} parentStatement={undefined} />);

		expect(screen.getByTestId('evaluation')).toBeInTheDocument();
		expect(mockEvaluation).toHaveBeenCalledWith(
			expect.objectContaining({ statement, hideFaceLabels: true, compact: true }),
		);
	});
});

describe('TreeOptionNode chat button', () => {
	const renderNode = (opensChatSheet: boolean): void => {
		render(
			<TreeOptionNode
				statement={statement}
				parentStatement={undefined}
				opensChatSheet={opensChatSheet}
				childCount={3}
				onToggleChildren={jest.fn()}
			/>,
		);
	};

	it('shows one chat button in place of reply and counter on the Discussion tab', () => {
		renderNode(true);

		expect(screen.getAllByTestId('chat-button')).toHaveLength(1);
		expect(screen.queryByRole('button', { name: 'reply' })).toBeNull();
		expect(screen.queryByRole('button', { name: '3 replies' })).toBeNull();
	});

	it('keeps Dive in and the bookmark beside the chat button', () => {
		renderNode(true);

		expect(screen.getByRole('button', { name: 'Dive in' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Bookmark' })).toBeInTheDocument();
	});

	it('orders the icon buttons Dive in, chat, bookmark', () => {
		renderNode(true);

		const names = screen
			.getAllByRole('button')
			.map((b) => b.getAttribute('aria-label') ?? b.textContent);

		expect(names).toEqual(['Dive in', 's1', 'Bookmark']);
		expect(screen.getByRole('button', { name: 'Dive in' })).toHaveTextContent('jump_to_element');
	});

	it('keeps Dive in before the bookmark in tree view', () => {
		renderNode(false);

		const names = screen
			.getAllByRole('button')
			.map((b) => b.getAttribute('aria-label') ?? b.textContent);

		expect(names).toEqual(['reply', 'Dive in', '3 replies', 'Bookmark']);
	});

	it('keeps reply and the counter and no chat button in tree view', () => {
		renderNode(false);

		expect(screen.getByRole('button', { name: 'reply' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '3 replies' })).toBeInTheDocument();
		expect(screen.queryByTestId('chat-button')).toBeNull();
	});
});
