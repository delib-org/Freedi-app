import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { HomeQuestion, HomeSpace } from '../../homeModel';
import HomeOverview from '../HomeOverview';

jest.mock('@/view/components/unreadBadge/UnreadMessagesBadge', () => ({
	__esModule: true,
	default: () => null,
}));

const spaces: HomeSpace[] = [
	{ id: 'space-1', title: 'Hatzor', tone: 'lilac', questionCount: 0, openCount: 0, hosting: true },
];
const questions: HomeQuestion[] = [
	{ id: 'q-1', title: 'Where should the bikes go?', tone: 'sunken', hosting: false },
];

const t = (key: string): string => key;

function renderHome(overrides: Partial<React.ComponentProps<typeof HomeOverview>> = {}) {
	const onOpenStatement = jest.fn();
	render(
		<HomeOverview
			firstName="Panda"
			spaces={spaces}
			questions={questions}
			loading={false}
			locale="en"
			onOpenStatement={onOpenStatement}
			onCreateQuestion={jest.fn()}
			onCreateGroup={jest.fn()}
			onOpenPin={jest.fn()}
			onVisibleViewChange={jest.fn()}
			t={t}
			{...overrides}
		/>,
	);

	return { onOpenStatement };
}

function showSpaces() {
	fireEvent.click(screen.getByRole('tab', { name: /Spaces/ }));
}

describe('HomeOverview', () => {
	it('opens the space itself when its card is pressed', () => {
		const { onOpenStatement } = renderHome();
		showSpaces();

		fireEvent.click(screen.getByTestId('home-space-card'));

		expect(onOpenStatement).toHaveBeenCalledWith('space-1');
	});

	// The old behaviour filtered the question list to the space instead, which
	// left a space whose questions nobody had joined showing "no conversations".
	it('does not swap to a filtered question list', () => {
		renderHome();
		showSpaces();

		fireEvent.click(screen.getByTestId('home-space-card'));

		expect(screen.getByTestId('home-space-card')).toBeInTheDocument();
		expect(screen.queryByText('No conversations found')).not.toBeInTheDocument();
	});

	it('opens a question from its row', () => {
		const { onOpenStatement } = renderHome();

		fireEvent.click(screen.getByTestId('home-question-row'));

		expect(onOpenStatement).toHaveBeenCalledWith('q-1');
	});

	it('labels the Questions-tab entry "Ask a question" and fires onCreateQuestion', () => {
		const onCreateQuestion = jest.fn();
		renderHome({ onCreateQuestion });

		fireEvent.click(screen.getByRole('button', { name: 'Ask a question' }));

		expect(onCreateQuestion).toHaveBeenCalledTimes(1);
	});

	it('has no sticky "New space" button under the Spaces list (the plus button adds spaces)', () => {
		renderHome();
		showSpaces();

		expect(screen.queryByTestId('home-new-space')).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /New space/ })).not.toBeInTheDocument();
	});

	it('keeps "+ New space" on the empty screen', () => {
		const onCreateGroup = jest.fn();
		renderHome({ spaces: [], questions: [], onCreateGroup });

		fireEvent.click(screen.getByRole('button', { name: /New space/ }));

		expect(onCreateGroup).toHaveBeenCalledTimes(1);
	});

	it('labels the empty-state entry "Ask a question"', () => {
		const onCreateQuestion = jest.fn();
		renderHome({ spaces: [], questions: [], onCreateQuestion });

		fireEvent.click(screen.getByRole('button', { name: 'Ask a question' }));

		expect(onCreateQuestion).toHaveBeenCalledTimes(1);
	});
});
