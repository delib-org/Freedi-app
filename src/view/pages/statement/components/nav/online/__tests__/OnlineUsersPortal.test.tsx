import { fireEvent, render, screen } from '@testing-library/react';
import { Statement, StatementType } from '@freedi/shared-types';
import { useOnlineUsers } from '@/controllers/hooks/useOnlineUsers';
import { useQuestionProgressRead } from '@/controllers/hooks/useQuestionProgress';
import OnlineUsers from '../OnlineUsers';

jest.mock('@/controllers/hooks/useOnlineUsers', () => ({ useOnlineUsers: jest.fn() }));
jest.mock('@/controllers/hooks/useQuestionProgress', () => ({
	useQuestionProgressRead: jest.fn(),
}));

const question = { statementId: 'q1', statementType: StatementType.question } as Statement;

describe('OnlineUsers profile card', () => {
	beforeEach(() => {
		(useOnlineUsers as jest.Mock).mockReturnValue({
			onlineUsers: [{ user: { uid: 'u1', displayName: 'Dana', photoURL: null }, tabInFocus: true }],
			isLoading: false,
		});
		(useQuestionProgressRead as jest.Mock).mockReturnValue({
			progress: { entered: 10 },
			isLoaded: true,
		});
	});

	it('renders the card in document.body, not inside the avatar wrapper', () => {
		const { container } = render(<OnlineUsers statement={question} />);

		fireEvent.click(screen.getAllByText('D')[0]);
		const card = screen.getByRole('tooltip');

		expect(card.parentElement).toBe(document.body);
		expect(container.contains(card)).toBe(false);
		expect(card.className).toContain('user-profile-popover--visible');
		expect(card.className).toContain('user-profile-popover--portal');
	});

	it('closes on an outside tap and on Escape, but not on a tap inside the card', () => {
		render(<OnlineUsers statement={question} />);

		fireEvent.click(screen.getAllByText('D')[0]);
		fireEvent.click(screen.getByRole('tooltip'));
		expect(screen.getByRole('tooltip').className).toContain('--visible');

		fireEvent.click(document.body);
		expect(screen.getByRole('tooltip').className).not.toContain('--visible');

		fireEvent.click(screen.getAllByText('D')[0]);
		expect(screen.getByRole('tooltip').className).toContain('--visible');
		fireEvent.keyDown(document, { key: 'Escape' });
		expect(screen.getByRole('tooltip').className).not.toContain('--visible');
	});

	it('toggles closed when the avatar is pressed again', () => {
		render(<OnlineUsers statement={question} />);

		fireEvent.click(screen.getAllByText('D')[0]);
		fireEvent.click(screen.getAllByText('D')[0]);

		expect(screen.getByRole('tooltip').className).not.toContain('--visible');
	});

	it('keeps the card inside a narrow viewport when the avatar is at the edge', () => {
		render(<OnlineUsers statement={question} />);
		const avatar = screen.getAllByText('D')[0].parentElement?.parentElement as HTMLElement;

		jest.spyOn(avatar, 'getBoundingClientRect').mockReturnValue({
			left: 0,
			right: 32,
			top: 100,
			bottom: 132,
			width: 32,
			height: 32,
			x: 0,
			y: 100,
			toJSON: () => ({}),
		});
		fireEvent.click(avatar);
		const card = screen.getByRole('tooltip');

		expect(parseInt(card.style.getPropertyValue('--popover-left'), 10)).toBeGreaterThanOrEqual(8);
		expect(card.style.getPropertyValue('--popover-top')).toBe('140px');
	});
});
