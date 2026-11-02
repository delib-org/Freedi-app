import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Users } from 'lucide-react';
import HostHubCard from '../HostHubCard';

function renderCard(expanded: boolean, onToggle = jest.fn()) {
	return render(
		<HostHubCard
			id="live"
			title="People"
			description="Who is in"
			icon={Users}
			expanded={expanded}
			onToggle={onToggle}
		>
			<p>Card body</p>
		</HostHubCard>,
	);
}

describe('HostHubCard', () => {
	it('keeps aria-controls pointing at an element while closed, without mounting the body', () => {
		const { container } = renderCard(false);
		const toggle = screen.getByRole('button', { name: /People/ });
		const controlled = container.querySelector(`[id="${toggle.getAttribute('aria-controls')}"]`);

		expect(controlled).not.toBeNull();
		expect(toggle).toHaveAttribute('aria-expanded', 'false');
		expect(screen.queryByText('Card body')).toBeNull();
		expect(container.querySelector('section')).toHaveAttribute('data-expanded', 'false');
	});

	it('shows the body when expanded and reports its id on toggle', () => {
		const onToggle = jest.fn();
		const { container } = renderCard(true, onToggle);

		expect(screen.getByText('Card body')).toBeTruthy();
		expect(container.querySelector('section')).toHaveAttribute('data-expanded', 'true');
		fireEvent.click(screen.getByRole('button', { name: /People/ }));
		expect(onToggle).toHaveBeenCalledWith('live');
	});
});
