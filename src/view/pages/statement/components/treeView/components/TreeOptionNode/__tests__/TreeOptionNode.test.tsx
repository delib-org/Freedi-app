import { render, screen } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import TreeOptionNode from '../TreeOptionNode';

const mockEvaluation = jest.fn();

jest.mock('../TreeOptionNode.module.scss', () => ({
	__esModule: true,
	default: new Proxy({}, { get: (_target, key) => key }),
}));
jest.mock('react-router', () => ({ useNavigate: () => jest.fn() }));
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

		return <div data-testid="evaluation" />;
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
			expect.objectContaining({ statement, hideFaceLabels: true }),
		);
	});
});
