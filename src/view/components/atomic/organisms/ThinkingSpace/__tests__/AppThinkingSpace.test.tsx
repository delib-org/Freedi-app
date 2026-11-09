import React from 'react';
import { render, screen } from '@testing-library/react';
import AppThinkingSpace from '../AppThinkingSpace';

const mockSignedIn: { uid: string } = { uid: 'u1' };
let mockCurrentUser: { uid: string } | null = mockSignedIn;

jest.mock('react-router', () => ({
	useNavigate: () => jest.fn(),
	useLocation: () => ({ pathname: '/statement/s1', search: '' }),
}));
jest.mock('@/controllers/hooks/reduxHooks', () => ({
	useAppSelector: (selector: { selectorName?: string }) =>
		selector.selectorName === 'creator' ? mockCurrentUser : [],
}));
jest.mock('@/redux/creator/creatorSlice', () => ({
	creatorSelector: { selectorName: 'creator' },
}));
jest.mock('@/redux/statements/statementsSlice', () => ({
	topSubscriptionsSelector: { selectorName: 'subscriptions' },
}));
jest.mock('@/redux/notificationsSlice/notificationsSlice', () => ({
	inAppNotificationsSelector: { selectorName: 'notifications' },
}));
jest.mock('@/utils/engagementNavigation', () => ({
	relevantNotifications: () => [],
}));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key, dir: 'ltr' }),
}));
jest.mock('@/controllers/hooks/useSlideAndSubStatement', () => ({
	useLevelTransition: () => ({ className: '' }),
}));
jest.mock('@/controllers/hooks/useAnswerCompose', () => ({
	AnswerComposeContext: jest.requireActual('react').createContext(null),
	useAnswerComposeState: () => ({ compose: () => false }),
}));
jest.mock('@/view/pages/home/askQuestion/AskQuestionSheet', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock('../ThinkingSpace', () => ({
	__esModule: true,
	default: ({
		bottomNav,
		children,
	}: {
		bottomNav?: React.ReactNode;
		children: React.ReactNode;
	}) => (
		<div>
			{children}
			{bottomNav}
		</div>
	),
}));
jest.mock('../../BottomNav/BottomNav', () => ({
	__esModule: true,
	default: () => <nav data-testid="bottom-nav" />,
}));

describe('AppThinkingSpace bottom nav', () => {
	beforeEach(() => {
		mockCurrentUser = mockSignedIn;
	});

	it('shows the floating nav for a signed-in user by default', () => {
		render(<AppThinkingSpace>content</AppThinkingSpace>);

		expect(screen.getByTestId('bottom-nav')).toBeInTheDocument();
	});

	it('hides the floating nav when the screen owns the bottom edge', () => {
		render(<AppThinkingSpace hideBottomNav>content</AppThinkingSpace>);

		expect(screen.queryByTestId('bottom-nav')).toBeNull();
		expect(screen.getByText('content')).toBeInTheDocument();
	});

	it('shows no nav without a signed-in user', () => {
		mockCurrentUser = null;
		render(<AppThinkingSpace>content</AppThinkingSpace>);

		expect(screen.queryByTestId('bottom-nav')).toBeNull();
	});
});
