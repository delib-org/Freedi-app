import type React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { Creator, UserEngagement } from '@freedi/shared-types';
import { listenToUserEngagement } from '@/controllers/db/engagement/db_engagement';
import My from '../My';

const mockRelease = jest.fn();
let mockCreator: Partial<Creator> | null;
let mockEngagement: Partial<UserEngagement> | null;

jest.mock('@/controllers/db/engagement/db_engagement', () => ({
	listenToUserEngagement: jest.fn(),
}));
jest.mock('@/redux/creator/creatorSlice', () => ({ creatorSelector: 'creator' }));
jest.mock('@/redux/engagement/engagementSlice', () => ({
	userEngagementSelector: 'engagement',
	userLevelSelector: 'level',
}));
jest.mock('@/controllers/hooks/reduxHooks', () => ({
	useAppSelector: (selector: unknown) => {
		if (selector === 'creator') return mockCreator;
		if (selector === 'engagement') return mockEngagement;

		return 0;
	},
}));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key, dir: 'ltr', currentLanguage: 'en' }),
}));
jest.mock('@/controllers/hooks/useUserConfig', () => ({
	useUserConfig: () => ({
		fontSize: 16,
		changeFontSize: jest.fn(),
		colorContrast: false,
		setColorContrast: jest.fn(),
	}),
}));
jest.mock('@/controllers/hooks/useAuthentication', () => ({
	useAuthentication: () => ({ user: null }),
}));
jest.mock('@/controllers/db/user/setUser', () => ({ setUserAdvanceUserToDB: jest.fn() }));
jest.mock('@/controllers/db/authenticationUtils', () => ({ logOut: jest.fn() }));
jest.mock('@/helpers/engagementLabels', () => ({ getDisplayLevel: () => 'Observer' }));
jest.mock('@/view/components/changeLanguage/ChangeLanguage', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock('../AccessibilitySheet', () => ({ __esModule: true, default: () => null }));

function page(): React.ReactElement {
	return (
		<MemoryRouter>
			<My />
		</MemoryRouter>
	);
}

describe('My engagement data', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockCreator = { uid: 'u1', displayName: 'Dana' };
		mockEngagement = null;
		(listenToUserEngagement as jest.Mock).mockReturnValue(mockRelease);
	});

	it('starts the engagement listener on a direct load', () => {
		render(page());

		expect(listenToUserEngagement).toHaveBeenCalledTimes(1);
	});

	it('waits for the signed-in user before listening', () => {
		mockCreator = null;
		const { rerender } = render(page());
		expect(listenToUserEngagement).not.toHaveBeenCalled();

		mockCreator = { uid: 'u1', displayName: 'Dana' };
		rerender(page());

		expect(listenToUserEngagement).toHaveBeenCalledTimes(1);
	});

	it('releases the listener on leaving the page', () => {
		const { unmount } = render(page());
		unmount();

		expect(mockRelease).toHaveBeenCalledTimes(1);
	});

	it('shows the numbers the listener delivered', () => {
		mockEngagement = { totalOptions: 2, totalEvaluations: 7 };
		render(page());

		expect(screen.getByTestId('me-impact')).toHaveTextContent('2Answers added');
		expect(screen.getByTestId('me-impact')).toHaveTextContent('7Ratings');
	});
});
