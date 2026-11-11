import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import Back from '../Back';

const mockNavigate = jest.fn();
const mockResolveUpTarget = jest.fn();

jest.mock('react-router', () => ({ useNavigate: () => mockNavigate }));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/controllers/hooks/useUpTarget', () => ({
	useUpTarget: () => mockResolveUpTarget,
}));
jest.mock('@/view/components/atomic/organisms/BottomNav/bottomNavModel', () => ({
	HOME_PATH: '/home',
}));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

const statement = { statementId: 'q1', parentId: 'group' } as Statement;

const tapBack = () => fireEvent.click(screen.getByRole('button', { name: 'Back' }));

describe('Back', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		window.history.pushState({}, '', '/statement/q1');
	});

	it('goes to the nearest open level', async () => {
		mockResolveUpTarget.mockResolvedValue('mid');
		render(<Back statement={statement} />);
		tapBack();

		await waitFor(() =>
			expect(mockNavigate).toHaveBeenCalledWith('/statement/mid', expect.anything()),
		);
	});

	it('goes Home when nothing above is open', async () => {
		mockResolveUpTarget.mockResolvedValue(undefined);
		render(<Back statement={statement} />);
		tapBack();

		await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/home', expect.anything()));
	});

	it('leaves the statement-screen branch alone', () => {
		window.history.pushState({}, '', '/statement-screen/q1/settings');
		render(<Back statement={statement} />);
		tapBack();

		expect(mockNavigate).toHaveBeenCalledWith('/statement/q1', expect.anything());
		expect(mockResolveUpTarget).not.toHaveBeenCalled();
	});

	it('leaves the stage branch alone', () => {
		window.history.pushState({}, '', '/stage/q1');
		render(<Back statement={statement} />);
		tapBack();

		expect(mockNavigate).toHaveBeenCalledWith('/statement/q1', expect.anything());
		expect(mockResolveUpTarget).not.toHaveBeenCalled();
	});

	it('waits for the look to finish, and two taps navigate once', async () => {
		let finish: (id: string) => void = () => undefined;
		mockResolveUpTarget.mockReturnValue(
			new Promise<string>((resolve) => {
				finish = resolve;
			}),
		);
		render(<Back statement={statement} />);
		tapBack();
		tapBack();

		expect(mockNavigate).not.toHaveBeenCalled();

		await act(async () => finish('mid'));

		expect(mockNavigate).toHaveBeenCalledTimes(1);
	});

	it('drops a waiting tap once the person has left', async () => {
		let finish: (id: string) => void = () => undefined;
		mockResolveUpTarget.mockReturnValue(
			new Promise<string>((resolve) => {
				finish = resolve;
			}),
		);
		const { unmount } = render(<Back statement={statement} />);
		tapBack();
		unmount();

		await act(async () => finish('mid'));

		expect(mockNavigate).not.toHaveBeenCalled();
	});
});
