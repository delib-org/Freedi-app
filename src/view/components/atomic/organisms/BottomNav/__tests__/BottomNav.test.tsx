import { render, screen } from '@testing-library/react';
import BottomNav from '../BottomNav';

const renderNav = (canCompose?: boolean) =>
	render(
		<BottomNav
			active="home"
			unreadCount={0}
			onNavigate={jest.fn()}
			onAsk={jest.fn()}
			canCompose={canCompose}
			t={(key) => key}
		/>,
	);

describe('BottomNav "+" label', () => {
	it('says Add an answer when it will open the answer sheet', () => {
		renderNav(true);

		expect(screen.getByTestId('bottom-nav-ask')).toHaveAccessibleName('Add an answer');
	});

	it.each([false, undefined])('says Ask a question otherwise (canCompose=%s)', (canCompose) => {
		renderNav(canCompose);

		expect(screen.getByTestId('bottom-nav-ask')).toHaveAccessibleName('Ask a question');
	});
});
