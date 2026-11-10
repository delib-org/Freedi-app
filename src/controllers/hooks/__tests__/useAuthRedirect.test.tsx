import { renderHook } from '@testing-library/react';
import { useAuthRedirect } from '../useAuthRedirect';
import { AuthState } from '../useAuthentication';
import { readInitialRoute } from '@/helpers/initialRoute';

const mockNavigate = jest.fn();
let mockLocation: { pathname: string; search: string };

jest.mock('react-router', () => ({
	useNavigate: () => mockNavigate,
	useLocation: () => mockLocation,
}));
jest.mock('../useAuthentication', () => ({}));

const signedOut = {
	isAuthenticated: false,
	isLoading: false,
	user: null,
	creator: null,
} as AuthState;

describe('useAuthRedirect', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		localStorage.clear();
	});

	it('keeps the query string when it sends a signed-out visitor to /start', () => {
		mockLocation = { pathname: '/my/engagement', search: '?tab=badges' };
		renderHook(() => useAuthRedirect(signedOut));

		expect(readInitialRoute()).toBe('/my/engagement?tab=badges');
		expect(mockNavigate).toHaveBeenCalledWith('/start', { replace: true });
	});

	it('leaves public routes alone', () => {
		mockLocation = { pathname: '/statement/s1', search: '?tab=options' };
		renderHook(() => useAuthRedirect(signedOut));

		expect(mockNavigate).not.toHaveBeenCalled();
		expect(readInitialRoute()).toBeUndefined();
	});

	it('waits for the auth check', () => {
		mockLocation = { pathname: '/my', search: '' };
		renderHook(() => useAuthRedirect({ ...signedOut, isLoading: true }));

		expect(mockNavigate).not.toHaveBeenCalled();
	});
});
