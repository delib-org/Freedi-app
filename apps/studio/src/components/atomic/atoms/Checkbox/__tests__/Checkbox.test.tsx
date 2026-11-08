import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import Checkbox from '../Checkbox';

describe('Studio Checkbox', () => {
	const onChange = vi.fn();

	beforeEach(() => {
		onChange.mockClear();
	});

	afterEach(() => {
		cleanup();
	});

	it('makes the native input the only focusable control, named by the label', () => {
		const { container } = render(
			<Checkbox label="Open it now" checked={false} onChange={onChange} />,
		);

		const input = screen.getByRole('checkbox', { name: 'Open it now' }) as HTMLInputElement;
		const label = container.querySelector('label') as HTMLLabelElement;

		expect(input.tagName).toBe('INPUT');
		expect(input.getAttribute('tabindex')).toBeNull();
		expect(input.getAttribute('aria-hidden')).toBeNull();
		expect(label.getAttribute('role')).toBeNull();
		expect(label.getAttribute('tabindex')).toBeNull();
		expect(container.querySelectorAll('[role="checkbox"]').length).toBe(0);
	});

	it('reports the new checked value from the native change', () => {
		render(<Checkbox label="Email" checked={false} onChange={onChange} />);

		fireEvent.click(screen.getByRole('checkbox', { name: 'Email' }));

		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenCalledWith(true);
	});

	it('reports false when a checked box is clicked', () => {
		render(<Checkbox label="Email" checked onChange={onChange} />);

		fireEvent.click(screen.getByRole('checkbox', { name: 'Email' }));

		expect(onChange).toHaveBeenCalledWith(false);
	});

	it('toggles when the label text is clicked', () => {
		render(<Checkbox label="In-app" checked={false} onChange={onChange} />);

		fireEvent.click(screen.getByText('In-app'));

		expect(onChange).toHaveBeenCalledWith(true);
	});

	it('does not toggle while disabled', () => {
		render(<Checkbox label="Locked" checked={false} disabled onChange={onChange} />);

		const input = screen.getByRole('checkbox', { name: 'Locked' }) as HTMLInputElement;
		fireEvent.click(input);

		expect(input.disabled).toBe(true);
		expect(onChange).not.toHaveBeenCalled();
	});

	it('sets the real DOM indeterminate property only when unchecked', () => {
		const { rerender } = render(
			<Checkbox label="All schools" checked={false} indeterminate onChange={onChange} />,
		);
		const input = screen.getByRole('checkbox', { name: 'All schools' }) as HTMLInputElement;

		expect(input.indeterminate).toBe(true);
		expect(input.closest('label')?.className).toContain('checkbox--indeterminate');

		rerender(<Checkbox label="All schools" checked indeterminate onChange={onChange} />);

		expect(input.indeterminate).toBe(false);
		expect(input.closest('label')?.className).not.toContain('checkbox--indeterminate');
	});

	it('gives two checkboxes with the same label distinct ids via useId', () => {
		render(
			<>
				<Checkbox label="Same" checked={false} onChange={onChange} />
				<Checkbox label="Same" checked={false} onChange={onChange} />
			</>,
		);

		const [first, second] = screen.getAllByRole('checkbox');

		expect(first.id).not.toBe('');
		expect(first.id).not.toBe(second.id);
	});

	it('keeps an explicit id and uses ariaLabel when there is no visible label', () => {
		render(
			<Checkbox
				label=""
				ariaLabel="Select Dana"
				id="pick-dana"
				checked={false}
				onChange={onChange}
			/>,
		);

		const input = screen.getByRole('checkbox', { name: 'Select Dana' });

		expect(input.id).toBe('pick-dana');
	});

	it('renders the hint inside the label', () => {
		render(<Checkbox label="Source" hint="Question" checked={false} onChange={onChange} />);

		expect(screen.getByText('Question').closest('label')).not.toBeNull();
	});
});
