import React from 'react';
import { render, screen } from '@testing-library/react';
import EmptyState from '../EmptyState';

describe('EmptyState', () => {
	it('renders the sentence in the block', () => {
		const { container } = render(<EmptyState text="Nobody is waiting" />);

		expect(container.firstChild).toHaveClass('empty-state');
		expect(container.firstChild).not.toHaveClass('empty-state--compact');
		expect(screen.getByText('Nobody is waiting')).toHaveClass('empty-state__text');
	});

	it('marks the icon decorative and adds hint, action and compact', () => {
		const { container } = render(
			<EmptyState
				text="Nobody is waiting"
				hint="People who ask to join appear here"
				icon={<svg data-testid="icon" />}
				action={<button type="button">Invite</button>}
				compact
			/>,
		);
		const icon = screen.getByTestId('icon').parentElement;

		expect(container.firstChild).toHaveClass('empty-state--compact');
		expect(icon).toHaveClass('empty-state__icon');
		expect(icon).toHaveAttribute('aria-hidden', 'true');
		expect(screen.getByText('People who ask to join appear here')).toHaveClass('empty-state__hint');
		expect(screen.getByRole('button', { name: 'Invite' })).toBeTruthy();
	});
});
