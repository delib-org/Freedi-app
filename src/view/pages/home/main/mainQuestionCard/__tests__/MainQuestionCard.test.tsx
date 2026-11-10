import React from 'react';
import { render, screen } from '@testing-library/react';
import { Access, Role, SimpleStatement } from '@freedi/shared-types';
import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import { getStatementSubscriptionFromDB } from '@/controllers/db/subscriptions/getSubscriptions';
import MainQuestionCard from '../MainQuestionCard';

let mockStatements: Record<string, unknown>;
let mockSubscriptions: Record<string, unknown>;

jest.mock('react-router', () => ({
	Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
jest.mock('react-redux', () => ({
	useDispatch: () => jest.fn(),
	useSelector: (selector: () => unknown) => selector(),
}));
jest.mock('@/redux/creator/creatorSlice', () => ({
	creatorSelector: () => ({ uid: 'u1', isAnonymous: false }),
}));
jest.mock('@/redux/statements/statementsSlice', () => {
	const byId = (id?: string) => () => (id ? mockStatements[id] : undefined);

	return {
		statementSelector: byId,
		statementSelectorById: byId,
		statementSubscriptionSelector: (id?: string) => () => (id ? mockSubscriptions[id] : undefined),
		setStatement: jest.fn(),
	};
});
jest.mock('@/controllers/db/statements/listenToStatements', () => ({
	listenToStatement: () => () => undefined,
}));
jest.mock('@/controllers/db/statements/getStatement', () => ({
	getStatementFromDB: jest.fn(async () => undefined),
}));
jest.mock('@/controllers/db/subscriptions/getSubscriptions', () => ({
	getStatementSubscriptionFromDB: jest.fn(),
}));
jest.mock('@/controllers/general/helpers', () => ({ getTime: () => '' }));
jest.mock('@/helpers/getCreatorDisplayName', () => ({ getCreatorDisplayName: () => '' }));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));
jest.mock(
	'@/view/pages/statement/components/chat/components/statementChatMore/StatementChatMore',
	() => ({ __esModule: true, default: () => null }),
);

const simple = { statementId: 'q1', statement: 'A question' } as SimpleStatement;
const question = {
	statementId: 'q1',
	parentId: 'mid',
	topParentId: 'group',
	lastSubStatements: [{ statementId: 'x', statement: 'hello' }],
	membership: { access: Access.public },
};
const mid = (access?: Access) => ({
	statementId: 'mid',
	topParentId: 'group',
	statement: 'Middle level',
	membership: access ? { access } : undefined,
});
const group = (access: Access) => ({
	statementId: 'group',
	topParentId: 'group',
	statement: 'Closed group',
	membership: { access },
});

describe('MainQuestionCard path text', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockSubscriptions = {};
	});

	it('shows every level known to be open', () => {
		mockStatements = { q1: question, mid: mid(Access.public), group: group(Access.openToAll) };
		render(<MainQuestionCard simpleStatement={simple} />);

		expect(screen.getByText('Closed group › Middle level')).toBeInTheDocument();
	});

	it('drops a closed top parent and keeps the open level under it', () => {
		mockStatements = { q1: question, mid: mid(Access.public), group: group(Access.secret) };
		render(<MainQuestionCard simpleStatement={simple} />);

		expect(screen.getByText('Middle level')).toBeInTheDocument();
		expect(screen.queryByText(/Closed group/)).not.toBeInTheDocument();
	});

	it('drops every closed level', () => {
		mockStatements = { q1: question, mid: mid(), group: group(Access.secret) };
		render(<MainQuestionCard simpleStatement={simple} />);

		expect(screen.queryByText(/Middle level/)).not.toBeInTheDocument();
		expect(screen.queryByText(/Closed group/)).not.toBeInTheDocument();
	});

	it('shows closed levels to a member', () => {
		mockStatements = { q1: question, mid: mid(), group: group(Access.secret) };
		mockSubscriptions = { group: { role: Role.member } };
		render(<MainQuestionCard simpleStatement={simple} />);

		expect(screen.getByText('Closed group › Middle level')).toBeInTheDocument();
	});

	it('omits a level it does not know, and reads no subscription to find out', () => {
		mockStatements = { q1: question };
		render(<MainQuestionCard simpleStatement={simple} />);

		expect(screen.queryByText(/›/)).not.toBeInTheDocument();
		expect(getStatementSubscriptionFromDB).not.toHaveBeenCalled();
		expect(getStatementFromDB).toHaveBeenCalledWith('mid', { expectRefusal: true });
	});
});
