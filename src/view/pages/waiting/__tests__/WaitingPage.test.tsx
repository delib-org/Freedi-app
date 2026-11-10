import React from 'react';
import { render, screen } from '@testing-library/react';
import WaitingPage from '../WaitingPage';

let mockLocation: { pathname: string; state: unknown };

jest.mock('react-router', () => ({
	Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
		<a href={to}>{children}</a>
	),
	useLocation: () => mockLocation,
}));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/view/components/atomic/organisms/BottomNav/bottomNavModel', () => ({
	HOME_PATH: '/home',
}));

describe('WaitingPage actions', () => {
	it('offers the way back first, then home', () => {
		mockLocation = { pathname: '/statement/group', state: { from: '/statement/q1' } };
		render(<WaitingPage />);

		const links = screen.getAllByRole('link');

		expect(links.map((link) => link.getAttribute('href'))).toEqual(['/statement/q1', '/home']);
		expect(screen.getByText('Back to the question')).toBeInTheDocument();
	});

	it('offers only home when the person did not come from a question', () => {
		mockLocation = { pathname: '/statement/group', state: null };
		render(<WaitingPage />);

		expect(screen.queryByText('Back to the question')).not.toBeInTheDocument();
		expect(screen.getByRole('link')).toHaveAttribute('href', '/home');
	});
});
