import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import HeaderMenu from '../HeaderMenu';

jest.mock('@/assets/icons/addQuestion.svg?react', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock('@/assets/icons/homeIcon.svg?react', () => ({ __esModule: true, default: () => null }));
jest.mock('@/assets/icons/disconnectIcon.svg?react', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock('@/assets/icons/follow.svg?react', () => ({ __esModule: true, default: () => null }));
jest.mock('@/assets/icons/invitation.svg?react', () => ({ __esModule: true, default: () => null }));
jest.mock('@/assets/icons/shareIcon.svg?react', () => ({ __esModule: true, default: () => null }));
jest.mock('@/assets/icons/settings.svg?react', () => ({ __esModule: true, default: () => null }));
jest.mock('@/assets/icons/triangle.svg?react', () => ({ __esModule: true, default: () => null }));
jest.mock('@/assets/icons/navMainPageIcon.svg?react', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock('@/view/components/menu/Menu', () => ({
	__esModule: true,
	default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/view/components/menu/MenuOption', () => ({
	__esModule: true,
	default: ({ label, onOptionClick }: { label: string; onOptionClick: () => void }) => (
		<button type="button" onClick={onOptionClick}>
			{label}
		</button>
	),
}));
jest.mock('@/view/components/changeLanguage/ChangeLanguage', () => ({
	__esModule: true,
	default: () => null,
}));
jest.mock('@/view/components/atomic/atoms/LanguagePill/LanguagePill', () => ({
	__esModule: true,
	default: jest.requireActual('react').forwardRef(() => null),
}));

const noop = (): void => undefined;

function renderMenu(onNavigateHome?: () => void, onAskQuestion?: () => void): void {
	render(
		<HeaderMenu
			statement={{ statementId: 's1', statementSettings: {} } as Statement}
			isMenuOpen
			setIsMenuOpen={noop}
			headerStyle={{ color: 'black', backgroundColor: 'white' }}
			isAdmin={false}
			currentLanguage="en"
			t={(key) => key}
			onShare={noop}
			onLogout={noop}
			onFollowMe={noop}
			onInvitePanel={noop}
			onNavigateToSettings={noop}
			onNavigateToScreen={noop}
			onNavigateToClusterMap={noop}
			onNavigateHome={onNavigateHome}
			onAskQuestion={onAskQuestion}
		/>,
	);
}

describe('HeaderMenu Home row', () => {
	it('puts Home first and calls onNavigateHome', () => {
		const onNavigateHome = jest.fn();
		renderMenu(onNavigateHome);

		const buttons = screen.getAllByRole('button');
		expect(buttons[0]).toHaveTextContent('Home');
		fireEvent.click(buttons[0]);
		expect(onNavigateHome).toHaveBeenCalledTimes(1);
	});

	it('renders no Home row when onNavigateHome is not given', () => {
		renderMenu();

		expect(screen.queryByText('Home')).toBeNull();
	});
});

describe('HeaderMenu Ask a question row', () => {
	it('puts Ask a question after Home and calls onAskQuestion', () => {
		const onAskQuestion = jest.fn();
		renderMenu(noop, onAskQuestion);

		const buttons = screen.getAllByRole('button');
		expect(buttons[0]).toHaveTextContent('Home');
		expect(buttons[1]).toHaveTextContent('Ask a question');
		fireEvent.click(buttons[1]);
		expect(onAskQuestion).toHaveBeenCalledTimes(1);
	});

	it('renders no Ask a question row when onAskQuestion is not given', () => {
		renderMenu(noop);

		expect(screen.queryByText('Ask a question')).toBeNull();
	});
});
