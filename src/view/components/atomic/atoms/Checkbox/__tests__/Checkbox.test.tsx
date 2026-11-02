/**
 * Tests for Checkbox atomic component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Checkbox from '../Checkbox';

describe('Checkbox', () => {
	const defaultProps = {
		label: 'Accept terms',
		checked: false,
		onChange: jest.fn(),
	};

	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('rendering', () => {
		it('should render with checkbox role', () => {
			const { container } = render(<Checkbox {...defaultProps} />);

			const input = container.querySelector('input[type="checkbox"]');
			expect(input).toBeInTheDocument();
		});

		it('should render label text', () => {
			render(<Checkbox {...defaultProps} />);

			expect(screen.getByText('Accept terms')).toBeInTheDocument();
		});

		it('should render with default BEM classes', () => {
			render(<Checkbox {...defaultProps} />);

			const label = screen.getByText('Accept terms').closest('label');
			expect(label).toHaveClass('checkbox');
		});

		it('should render the hidden native checkbox input', () => {
			const { container } = render(<Checkbox {...defaultProps} />);

			const input = container.querySelector('input[type="checkbox"]');
			expect(input).toBeInTheDocument();
			expect(input).toHaveClass('checkbox__input');
		});
	});

	describe('checked state', () => {
		it('should not have checked class when unchecked', () => {
			render(<Checkbox {...defaultProps} checked={false} />);

			const label = screen.getByText('Accept terms').closest('label');
			expect(label).not.toHaveClass('checkbox--checked');
		});

		it('should have checked class when checked', () => {
			render(<Checkbox {...defaultProps} checked={true} />);

			const label = screen.getByText('Accept terms').closest('label');
			expect(label).toHaveClass('checkbox--checked');
		});

		it('exposes the native input as the checkbox, checked state included', () => {
			render(<Checkbox {...defaultProps} checked={true} />);

			const box = screen.getByRole('checkbox', { name: 'Accept terms' });
			expect(box.tagName).toBe('INPUT');
			expect(box).toBeChecked();
		});
	});

	describe('interactions', () => {
		it('should call onChange with true when clicking unchecked checkbox', () => {
			const handleChange = jest.fn();
			const { container } = render(
				<Checkbox {...defaultProps} checked={false} onChange={handleChange} />,
			);

			const input = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
			fireEvent.click(input);

			expect(handleChange).toHaveBeenCalledWith(true);
		});

		it('should call onChange with false when clicking checked checkbox', () => {
			const handleChange = jest.fn();
			const { container } = render(
				<Checkbox {...defaultProps} checked={true} onChange={handleChange} />,
			);

			const input = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
			fireEvent.click(input);

			expect(handleChange).toHaveBeenCalledWith(false);
		});

		it('should not call onChange when disabled', () => {
			const handleChange = jest.fn();
			render(<Checkbox {...defaultProps} disabled onChange={handleChange} />);

			const input = screen.getByRole('checkbox', { name: 'Accept terms' });
			expect(input).toBeDisabled();
			fireEvent.click(input);

			expect(handleChange).not.toHaveBeenCalled();
		});

		it('toggles when the label text is clicked', () => {
			const handleChange = jest.fn();
			render(<Checkbox {...defaultProps} checked={false} onChange={handleChange} />);

			fireEvent.click(screen.getByText('Accept terms'));

			expect(handleChange).toHaveBeenCalledWith(true);
		});

		it('is the one focusable control: no role or tabindex on the label', () => {
			render(<Checkbox {...defaultProps} />);

			const label = screen.getByText('Accept terms').closest('label') as HTMLElement;
			const input = screen.getByRole('checkbox');
			expect(label).not.toHaveAttribute('role');
			expect(label).not.toHaveAttribute('tabindex');
			expect(input).not.toHaveAttribute('aria-hidden');
			expect(input).not.toHaveAttribute('tabindex');
			expect(screen.getAllByRole('checkbox')).toHaveLength(1);
		});
	});

	describe('states', () => {
		it('should apply disabled class when disabled', () => {
			render(<Checkbox {...defaultProps} disabled />);

			const label = screen.getByText('Accept terms').closest('label');
			expect(label).toHaveClass('checkbox--disabled');
		});

		it('should apply error class when error', () => {
			render(<Checkbox {...defaultProps} error />);

			const label = screen.getByText('Accept terms').closest('label');
			expect(label).toHaveClass('checkbox--error');
		});

		it('should apply indeterminate class when indeterminate and not checked', () => {
			render(<Checkbox {...defaultProps} indeterminate />);

			const label = screen.getByText('Accept terms').closest('label');
			expect(label).toHaveClass('checkbox--indeterminate');
		});

		it('should not apply indeterminate class when checked', () => {
			render(<Checkbox {...defaultProps} checked indeterminate />);

			const label = screen.getByText('Accept terms').closest('label');
			expect(label).not.toHaveClass('checkbox--indeterminate');
			expect(label).toHaveClass('checkbox--checked');
		});
	});

	describe('sizes', () => {
		it('should apply small size class', () => {
			render(<Checkbox {...defaultProps} size="small" />);

			const label = screen.getByText('Accept terms').closest('label');
			expect(label).toHaveClass('checkbox--small');
		});

		it('should not add size class for medium (default)', () => {
			render(<Checkbox {...defaultProps} />);

			const label = screen.getByText('Accept terms').closest('label');
			expect(label).not.toHaveClass('checkbox--small');
			expect(label).not.toHaveClass('checkbox--medium');
			expect(label).not.toHaveClass('checkbox--large');
		});

		it('should apply large size class', () => {
			render(<Checkbox {...defaultProps} size="large" />);

			const label = screen.getByText('Accept terms').closest('label');
			expect(label).toHaveClass('checkbox--large');
		});
	});

	describe('custom icons', () => {
		it('should render custom unchecked icon when provided', () => {
			render(
				<Checkbox
					{...defaultProps}
					checked={false}
					icon={<span data-testid="unchecked-icon">Empty</span>}
					checkedIcon={<span data-testid="checked-icon">Full</span>}
				/>,
			);

			expect(screen.getByTestId('unchecked-icon')).toBeInTheDocument();
			expect(screen.queryByTestId('checked-icon')).not.toBeInTheDocument();
		});

		it('should render custom checked icon when checked', () => {
			render(
				<Checkbox
					{...defaultProps}
					checked={true}
					icon={<span data-testid="unchecked-icon">Empty</span>}
					checkedIcon={<span data-testid="checked-icon">Full</span>}
				/>,
			);

			expect(screen.getByTestId('checked-icon')).toBeInTheDocument();
			expect(screen.queryByTestId('unchecked-icon')).not.toBeInTheDocument();
		});
	});

	describe('hint text', () => {
		it('should render hint text when provided', () => {
			render(<Checkbox {...defaultProps} hint="You must accept to continue" />);

			expect(screen.getByText('You must accept to continue')).toBeInTheDocument();
		});

		it('should render hint with correct class', () => {
			render(<Checkbox {...defaultProps} hint="Hint text" />);

			const hint = screen.getByText('Hint text');
			expect(hint).toHaveClass('checkbox__hint');
		});
	});

	describe('additional props', () => {
		it('should apply custom className', () => {
			render(<Checkbox {...defaultProps} className="custom-class" />);

			const label = screen.getByText('Accept terms').closest('label');
			expect(label).toHaveClass('custom-class');
		});

		it('names the input with ariaLabel when the visible label is empty', () => {
			render(<Checkbox {...defaultProps} label="" ariaLabel="Select Maya" />);

			expect(screen.getByRole('checkbox', { name: 'Select Maya' })).toBeInTheDocument();
		});

		it('is named by its visible label by default', () => {
			render(<Checkbox {...defaultProps} />);

			expect(screen.getByRole('checkbox', { name: 'Accept terms' })).not.toHaveAttribute(
				'aria-label',
			);
		});

		it('marks the native input as mixed when indeterminate', () => {
			render(<Checkbox {...defaultProps} indeterminate />);

			expect((screen.getByRole('checkbox') as HTMLInputElement).indeterminate).toBe(true);
		});
	});
});
