import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PeopleSubsection from '../PeopleSubsection';

function renderSubsection(props: Partial<React.ComponentProps<typeof PeopleSubsection>> = {}) {
	const onToggle = jest.fn();
	const utils = render(
		<PeopleSubsection
			id="waiting"
			title="Waiting to join"
			isOpen={false}
			onToggle={onToggle}
			{...props}
		>
			<p>Body</p>
		</PeopleSubsection>,
	);

	return { ...utils, onToggle };
}

describe('PeopleSubsection', () => {
	it('is a section whose id is the anchor, with a heading button', () => {
		const { container } = renderSubsection();
		const section = container.querySelector('section');
		const header = screen.getByRole('button', { name: /Waiting to join/ });

		expect(section).toHaveAttribute('id', 'waiting');
		expect(section).toHaveClass('people-subsection');
		expect(section).not.toHaveClass('people-subsection--open');
		expect(header.closest('h3')).toHaveClass('people-subsection__heading');
		expect(header).toHaveAttribute('aria-expanded', 'false');
		expect(header).toHaveAttribute('aria-controls', 'waiting-body');
		expect(screen.queryByText('Body')).toBeNull();
	});

	it('shows the body and the open modifier when open', () => {
		const { container } = renderSubsection({ isOpen: true });

		expect(container.querySelector('section')).toHaveClass('people-subsection--open');
		expect(screen.getByRole('button', { name: /Waiting to join/ })).toHaveAttribute(
			'aria-expanded',
			'true',
		);
		expect(screen.getByText('Body')).toBeTruthy();
	});

	it('reports its id on toggle', () => {
		const { onToggle } = renderSubsection();

		fireEvent.click(screen.getByRole('button', { name: /Waiting to join/ }));
		expect(onToggle).toHaveBeenCalledWith('waiting');
	});

	it('shows a count badge with a spoken label only when something waits', () => {
		const { container, rerender, onToggle } = renderSubsection();
		expect(container.querySelector('.badge')).toBeNull();

		rerender(
			<PeopleSubsection
				id="waiting"
				title="Waiting to join"
				count={3}
				countLabel="3 waiting to join"
				isOpen={false}
				onToggle={onToggle}
			>
				<p>Body</p>
			</PeopleSubsection>,
		);
		expect(container.querySelector('section')).toHaveClass('people-subsection--attention');
		expect(container.querySelector('.badge')).toHaveClass(
			'badge--unread',
			'people-subsection__count',
		);
		expect(screen.getByRole('button', { name: /3 waiting to join/ })).toBeTruthy();
	});

	it('caps the badge at 99+', () => {
		const { container } = renderSubsection({ count: 120, countLabel: '120 waiting' });

		expect(container.querySelector('.people-subsection__count')).toHaveTextContent('99+');
	});

	it('renders the summary line when given', () => {
		renderSubsection({ summary: 'Open to all' });

		expect(screen.getByText('Open to all')).toHaveClass('people-subsection__summary');
	});
});
