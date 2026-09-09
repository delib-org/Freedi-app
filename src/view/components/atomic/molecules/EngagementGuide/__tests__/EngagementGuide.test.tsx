import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import EngagementGuide from '../EngagementGuide';

jest.mock('react-router', () => ({ useNavigate: () => jest.fn() }));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (text: string) => text }),
}));
jest.mock('@/controllers/hooks/reduxHooks', () => ({ useAppSelector: () => [] }));
jest.mock('@/controllers/hooks/useIsProcessHalted', () => ({
	useIsProcessHalted: () => ({ isHalted: false }),
}));
jest.mock('@/redux/statements/statementsSlice', () => ({
	statementOptionsSelector: () => () => [],
}));
jest.mock('@/redux/evaluations/evaluationsSlice', () => ({ evaluationsSelector: () => [] }));
jest.mock('@/redux/notificationsSlice/notificationsSlice', () => ({
	inAppNotificationsSelector: () => [],
}));
beforeEach(() => localStorage.clear());
it('closes, stays closed after remount, and can be restored', () => {
	const first = render(<EngagementGuide userId="one" onCreate={jest.fn()} />);
	fireEvent.click(screen.getByRole('button', { name: 'Hide guide' }));
	expect(screen.queryByRole('region')).not.toBeInTheDocument();
	first.unmount();
	render(<EngagementGuide userId="one" onCreate={jest.fn()} />);
	fireEvent.click(screen.getByRole('button', { name: 'Show guide' }));
	expect(screen.getByRole('region', { name: 'Your little guide' })).toBeInTheDocument();
});
it('keeps dismissal per user and offers a working first action', () => {
	localStorage.setItem('wizcol:guide-hidden:other', 'true');
	const create = jest.fn();
	render(<EngagementGuide userId="one" onCreate={create} />);
	fireEvent.click(screen.getByRole('button', { name: 'Start with a question.' }));
	expect(create).toHaveBeenCalledTimes(1);
});
