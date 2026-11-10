import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import { EntryVerdict } from '@/helpers/entryVerdict';
import { StatementContext } from '../../../StatementCont';
import FollowMeToast from '../FollowMeToast';

const mockNavigate = jest.fn();
let mockVerdict: EntryVerdict | undefined;
let mockTopParent: Partial<Statement>;

jest.mock('react-router', () => ({
	Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
	useLocation: () => ({ pathname: '/statement/q1', search: '' }),
	useNavigate: () => mockNavigate,
}));
jest.mock('react-redux', () => ({ useSelector: () => undefined }));
jest.mock('@/controllers/hooks/reduxHooks', () => ({ useAppSelector: () => mockTopParent }));
jest.mock('@/controllers/hooks/useLevelVerdict', () => ({
	useLevelVerdict: () => mockVerdict,
}));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key, dir: 'ltr' }),
}));
jest.mock('@/controllers/db/statements/setStatements', () => ({
	setFollowMeDB: jest.fn(),
	setPowerFollowMeDB: jest.fn(),
}));
jest.mock('@/controllers/db/statements/listenToStatements', () => ({
	listenToStatement: () => () => undefined,
}));
jest.mock('@/redux/statements/statementsSlice', () => ({
	statementSelector: () => () => undefined,
	statementSubscriptionSelector: () => () => undefined,
}));
jest.mock('../../../StatementCont', () => {
	const { createContext } = jest.requireActual('react');

	return { StatementContext: createContext({}) };
});
jest.mock('../../../../../components/icons/FollowMeIcon', () => ({
	__esModule: true,
	default: () => null,
}));

const statement = { statementId: 'q1', topParentId: 'group' } as Statement;

function renderToast() {
	return render(
		<StatementContext.Provider value={{ statement } as never}>
			<FollowMeToast />
		</StatementContext.Provider>,
	);
}

const notOpen: Array<EntryVerdict | undefined> = ['closed', 'waiting', 'gone', undefined];

describe('FollowMeToast access', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.clearAllMocks();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('shows the toast when the top parent is open', () => {
		mockVerdict = 'open';
		mockTopParent = { followMe: '/statement/other' };
		renderToast();

		expect(screen.getByText('Follow Instructor')).toBeInTheDocument();
	});

	it('redirects in power mode when the top parent is open', () => {
		mockVerdict = 'open';
		mockTopParent = { powerFollowMe: '/statement/other' };
		renderToast();
		act(() => {
			jest.runAllTimers();
		});

		expect(mockNavigate).toHaveBeenCalledWith('/statement/other');
	});

	it.each(notOpen)('shows no toast when the verdict is %s', (verdict) => {
		mockVerdict = verdict;
		mockTopParent = { followMe: '/statement/other' };
		renderToast();

		expect(screen.queryByText('Follow Instructor')).not.toBeInTheDocument();
	});

	it.each(notOpen)('does not redirect when the verdict is %s', (verdict) => {
		mockVerdict = verdict;
		mockTopParent = { powerFollowMe: '/statement/other' };
		const { container } = renderToast();
		act(() => {
			jest.runAllTimers();
		});

		expect(mockNavigate).not.toHaveBeenCalled();
		expect(container).toBeEmptyDOMElement();
	});
});
