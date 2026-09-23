import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { HomeQuestion, HomeSpace } from '../../homeModel';
import HomeOverview from '../HomeOverview';

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
});
