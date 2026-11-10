import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Page401 from '../Page401';
import { readInitialRoute } from '@/helpers/initialRoute';

const mockNavigate = jest.fn();
const mockLogOut = jest.fn();
let mockLocation: { pathname: string; search: string; state: unknown };
let mockUser: { uid: string; isAnonymous: boolean } | null;

jest.mock('react-router', () => ({
	useNavigate: () => mockNavigate,
	useLocation: () => mockLocation,
}));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/controllers/hooks/useAuthentication', () => ({
	useAuthentication: () => ({ user: mockUser }),
}));
jest.mock('@/controllers/db/authenticationUtils', () => ({
	logOut: () => mockLogOut(),
}));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

describe('Page401', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		localStorage.clear();
		mockLogOut.mockResolvedValue(undefined);
		mockUser = null;
		mockLocation = { pathname: '/statement/s1', search: '?tab=results', state: null };
	});

	it('offers a signed-out visitor sign-in, with home as the second choice', () => {
		render(<Page401 />);

		expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Back to home' })).toBeInTheDocument();
		expect(screen.queryByText('Take Me Home')).not.toBeInTheDocument();
	});

	it('returns a signed-out visitor to the original URL, query included', async () => {
		render(<Page401 />);
		fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

		await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/start', { replace: true }));
		expect(readInitialRoute()).toBe('/statement/s1?tab=results');
		expect(mockLogOut).not.toHaveBeenCalled();
	});

	it('uses the URL handed over by the /401 redirect', async () => {
		mockLocation = { pathname: '/401', search: '', state: { from: '/stage/s2?tab=chat' } };
		render(<Page401 />);
		fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

		await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
		expect(readInitialRoute()).toBe('/stage/s2?tab=chat');
	});

	it('ignores an unsafe handed-over URL', async () => {
		mockLocation = { pathname: '/401', search: '', state: { from: '//evil.com' } };
		render(<Page401 />);
		fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

		await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
		expect(readInitialRoute()).toBeUndefined();
	});

	it('signs an anonymous visitor out first, because /start bounces any session', async () => {
		mockUser = { uid: 'anon', isAnonymous: true };
		render(<Page401 />);
		fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

		await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/start', { replace: true }));
		expect(mockLogOut).toHaveBeenCalledTimes(1);
		expect(readInitialRoute()).toBe('/statement/s1?tab=results');
	});

	it('tells a signed-in person without access to ask the host', async () => {
		mockUser = { uid: 'u1', isAnonymous: false };
		render(<Page401 />);

		expect(screen.getByText('No access. Ask the host to invite you.')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();

		fireEvent.click(screen.getByRole('button', { name: 'Sign in with another account' }));

		await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/start', { replace: true }));
		expect(mockLogOut).toHaveBeenCalledTimes(1);
	});

	it('goes home from the secondary action', () => {
		render(<Page401 />);
		fireEvent.click(screen.getByRole('button', { name: 'Back to home' }));

		expect(mockNavigate).toHaveBeenCalledWith('/', expect.anything());
	});
});
