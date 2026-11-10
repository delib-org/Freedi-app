import { fireEvent, render, screen } from '@testing-library/react';
import { Statement, StatementType } from '@freedi/shared-types';
import QuestionHeaderBar from '../QuestionHeaderBar';
import StatementTopNav from '../../nav/top/StatementTopNav';

const mockNavigate = jest.fn();
const EXPECTED_PATH = '/statement-screen/s1/cluster-board';

jest.mock('react-router', () => ({
	useNavigate: () => mockNavigate,
	useParams: () => ({}),
}));
jest.mock('react-redux', () => ({ useSelector: () => undefined }));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key, currentLanguage: 'en', dir: 'ltr' }),
}));
jest.mock('@/controllers/hooks/useAuthentication', () => ({
	useAuthentication: () => ({ user: { uid: 'u1' } }),
}));
jest.mock('@/controllers/hooks/useStatementColor.ts', () => ({
	__esModule: true,
	default: () => ({ color: 'black', backgroundColor: 'white' }),
}));
jest.mock('@/controllers/hooks/reduxHooks', () => ({ useAppSelector: () => undefined }));
jest.mock('@/controllers/hooks/useOpenAskQuestion', () => ({
	useOpenAskQuestion: () => jest.fn(),
}));
jest.mock('@/redux/creator/creatorSlice', () => ({ creatorSelector: jest.fn() }));
jest.mock('@/redux/statements/statementsSlice', () => ({
	statementSelector: () => jest.fn(),
	statementSubscriptionSelector: () => jest.fn(),
}));
jest.mock('@/view/components/approveMembers/WaitingList', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock('@/view/components/notificationBtn/NotificationBtn', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock('@/view/components/notifications/NotificationSettingsButton', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock('../Back', () => ({ __esModule: true, default: () => null }));
jest.mock('../../nav/top/navButtons/NavButtons', () => ({ __esModule: true, default: () => null }));
jest.mock('@/view/components/atomic/organisms/BottomNav/bottomNavModel', () => ({
	HOME_PATH: '/home',
}));
jest.mock('../../nav/top/headerMenu/HeaderMenu', () => ({
	__esModule: true,
	default: ({ onNavigateToClusterMap }: { onNavigateToClusterMap: () => void }) => (
		<button type="button" onClick={onNavigateToClusterMap}>
			Topics map
		</button>
	),
}));

const statement = {
	statementId: 's1',
	topParentId: 's1',
	statementType: StatementType.question,
} as Statement;
const noop = (): void => undefined;

describe('Topics map from the header menu', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('QuestionHeaderBar opens the screen with the back button, not the share URL', () => {
		render(
			<QuestionHeaderBar
				statement={statement}
				isHost={false}
				onShare={noop}
				onOpenHub={noop}
				onFollowMe={noop}
				onInvitePanel={noop}
				onLogout={noop}
				isMenuOpen
				setIsMenuOpen={noop}
			/>,
		);
		fireEvent.click(screen.getByText('Topics map'));

		expect(mockNavigate).toHaveBeenCalledWith(EXPECTED_PATH);
	});

	it('StatementTopNav opens the screen with the back button, not the share URL', () => {
		render(
			<StatementTopNav
				statement={statement}
				handleShare={noop}
				handleFollowMe={noop}
				handleInvitePanel={noop}
				handleLogout={noop}
				setIsHeaderMenuOpen={noop}
				isHeaderMenuOpen
			/>,
		);
		fireEvent.click(screen.getByText('Topics map'));

		expect(mockNavigate).toHaveBeenCalledWith(EXPECTED_PATH);
	});
});
