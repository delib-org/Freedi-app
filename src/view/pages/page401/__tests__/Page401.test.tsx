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
jest.mock('@/view/components/atomic/organisms/BottomNav/bottomNavModel', () => ({
	HOME_PATH: '/home',
}));

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

		expect(mockNavigate).toHaveBeenCalledWith('/home', expect.anything());
	});

	it('titles the page in plain words and drops the 401 badge text', () => {
		render(<Page401 />);

		expect(screen.getByRole('heading', { name: 'This page is private' })).toBeInTheDocument();
		expect(screen.queryByText('401')).not.toBeInTheDocument();
	});

	it('orders the actions: back to the question, sign in, home', () => {
		mockLocation = { pathname: '/statement/group', search: '', state: { from: '/statement/q1' } };
		render(<Page401 />);

		expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
			'Back to the question',
			'Sign in',
			'Back to home',
		]);

		fireEvent.click(screen.getByRole('button', { name: 'Back to the question' }));

		expect(mockNavigate).toHaveBeenCalledWith('/statement/q1');
	});

	it('offers no way back to the closed page itself', () => {
		mockLocation = {
			pathname: '/statement/group',
			search: '',
			state: { from: '/statement/group' },
		};
		render(<Page401 />);

		expect(screen.queryByRole('button', { name: 'Back to the question' })).not.toBeInTheDocument();
	});

	it('offers no way back on /401, where from is the closed page', () => {
		mockLocation = { pathname: '/401', search: '', state: { from: '/statement/group' } };
		render(<Page401 />);

		expect(screen.queryByRole('button', { name: 'Back to the question' })).not.toBeInTheDocument();
	});

	it('rendered in place, returns to the closed page and not to where the person came from', async () => {
		mockLocation = { pathname: '/statement/group', search: '', state: { from: '/statement/q1' } };
		render(<Page401 />);
		fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

		await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
		expect(readInitialRoute()).toBe('/statement/group');
	});
});
