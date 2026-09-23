import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Chip from '../Chip';

describe('Chip', () => {
	it('renders a span without onClick and a button with one', () => {
		const { rerender } = render(<Chip label="Newest" />);
		expect(screen.getByText('Newest').closest('span.chip')).toBeInTheDocument();
		expect(screen.queryByRole('button')).not.toBeInTheDocument();

		rerender(<Chip label="Newest" onClick={() => {}} />);
		const button = screen.getByRole('button', { name: 'Newest' });
		expect(button).toHaveClass('chip', 'chip--interactive');
	});

	it('reflects selection with aria-pressed and the selected modifier', () => {
		const onClick = jest.fn();
		render(<Chip label="Agreement" selected onClick={onClick} />);
		const button = screen.getByRole('button');
		expect(button).toHaveAttribute('aria-pressed', 'true');
		expect(button).toHaveClass('chip--selected');
		fireEvent.click(button);
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	it('shows a count, muted and accent modifiers', () => {
		render(<Chip label="here" count={12} muted accentColor="#123456" />);
		const chip = screen.getByText('here').closest('.chip') as HTMLElement;
		expect(chip).toHaveClass('chip--muted', 'chip--accent');
		expect(chip.querySelector('.chip__count')).toHaveTextContent('12');
		expect(chip.style.getPropertyValue('--chip-accent')).toBe('#123456');
	});

	it('renders zero counts', () => {
		render(<Chip label="Answers" count={0} />);
		expect(screen.getByText('0')).toHaveClass('chip__count');
	});
});
