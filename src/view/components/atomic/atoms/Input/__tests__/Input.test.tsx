/**
 * Tests for Input atomic component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Input from '../Input';

describe('Input', () => {
	describe('rendering', () => {
		it('should render an input element', () => {
			render(<Input name="test" />);

			expect(screen.getByRole('textbox')).toBeInTheDocument();
		});

		it('should render with default BEM classes', () => {
			const { container } = render(<Input name="test" />);

			const wrapper = container.firstChild as HTMLElement;
			expect(wrapper).toHaveClass('input');
		});

		it('should render input field with correct class', () => {
			render(<Input name="test" />);

			const input = screen.getByRole('textbox');
			expect(input).toHaveClass('input__field');
		});

		it('should render with placeholder', () => {
			render(<Input name="test" placeholder="Type here..." />);

			expect(screen.getByPlaceholderText('Type here...')).toBeInTheDocument();
		});
	});

	describe('label', () => {
		it('should render label when provided', () => {
			render(<Input name="test" label="Username" />);

			expect(screen.getByText('Username')).toBeInTheDocument();
		});

		it('should render label with correct class', () => {
			render(<Input name="test" label="Username" />);

			const label = screen.getByText('Username');
			expect(label).toHaveClass('input__label');
		});

		it('should not render label when not provided', () => {
			const { container } = render(<Input name="test" />);

			expect(container.querySelector('.input__label')).not.toBeInTheDocument();
		});

		it('should show asterisk for required fields', () => {
			render(<Input name="test" label="Email" required />);

			const label = screen.getByText('Email');
			expect(label.textContent).toContain('*');
		});
	});

	describe('controlled value', () => {
		it('should render with controlled value', () => {
			render(<Input name="test" value="Hello" onChange={jest.fn()} />);

			expect(screen.getByRole('textbox')).toHaveValue('Hello');
		});

		it('should call onChange with new value on input change', () => {
			const handleChange = jest.fn();
			render(<Input name="test" value="" onChange={handleChange} />);

			fireEvent.change(screen.getByRole('textbox'), { target: { value: 'New value' } });

			expect(handleChange).toHaveBeenCalledWith('New value');
		});
	});

	describe('uncontrolled value', () => {
		it('should render with default value', () => {
			render(<Input name="test" defaultValue="Default" />);

			expect(screen.getByRole('textbox')).toHaveValue('Default');
		});

		it('should update internal value on change', () => {
			render(<Input name="test" />);

			const input = screen.getByRole('textbox');
			fireEvent.change(input, { target: { value: 'Typed text' } });

			expect(input).toHaveValue('Typed text');
		});
	});

	describe('states', () => {
		it('should apply error state class', () => {
			const { container } = render(<Input name="test" state="error" />);

			expect(container.firstChild).toHaveClass('input--error');
		});

		it('should apply success state class', () => {
			const { container } = render(<Input name="test" state="success" />);

			expect(container.firstChild).toHaveClass('input--success');
		});

		it('should apply disabled state class when disabled prop is true', () => {
			const { container } = render(<Input name="test" disabled />);

			expect(container.firstChild).toHaveClass('input--disabled');
		});

		it('should disable the input element when disabled', () => {
			render(<Input name="test" disabled />);

			expect(screen.getByRole('textbox')).toBeDisabled();
		});

		it('should set aria-invalid when in error state', () => {
			render(<Input name="test" state="error" />);

			expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
		});
	});

	describe('sizes', () => {
		it('should apply small size class', () => {
			const { container } = render(<Input name="test" size="small" />);

			expect(container.firstChild).toHaveClass('input--small');
		});

		it('should not add size class for medium (default)', () => {
			const { container } = render(<Input name="test" />);

			expect(container.firstChild).not.toHaveClass('input--small');
			expect(container.firstChild).not.toHaveClass('input--medium');
			expect(container.firstChild).not.toHaveClass('input--large');
		});

		it('should apply large size class', () => {
			const { container } = render(<Input name="test" size="large" />);

			expect(container.firstChild).toHaveClass('input--large');
		});
	});

	describe('helper and error text', () => {
		it('should render helper text when provided', () => {
			render(<Input name="test" helperText="Must be at least 3 characters" />);

			expect(screen.getByText('Must be at least 3 characters')).toBeInTheDocument();
		});

		it('should render helper text with correct class', () => {
			render(<Input name="test" helperText="Helper" />);

			expect(screen.getByText('Helper')).toHaveClass('input__helper-text');
		});

		it('should render error text when in error state', () => {
			render(<Input name="test" state="error" errorText="Invalid email" />);

			expect(screen.getByText('Invalid email')).toBeInTheDocument();
		});

		it('should render error text with alert role', () => {
			render(<Input name="test" state="error" errorText="Error message" />);

			expect(screen.getByRole('alert')).toBeInTheDocument();
		});

		it('should show error text instead of helper text when both provided', () => {
			render(
				<Input
					name="test"
					state="error"
					helperText="Normal help"
					errorText="Error happened"
				/>,
			);

			expect(screen.getByText('Error happened')).toBeInTheDocument();
			expect(screen.queryByText('Normal help')).not.toBeInTheDocument();
		});
	});

	describe('clearable', () => {
		it('should show clear button when clearable and value is present', () => {
			render(<Input name="test" value="Something" clearable onChange={jest.fn()} />);

			expect(screen.getByLabelText('Clear input')).toBeInTheDocument();
		});

		it('should not show clear button when value is empty', () => {
			render(<Input name="test" value="" clearable onChange={jest.fn()} />);

			expect(screen.queryByLabelText('Clear input')).not.toBeInTheDocument();
		});

		it('should call onChange with empty string on clear', () => {
			const handleChange = jest.fn();
			render(<Input name="test" value="Clear me" clearable onChange={handleChange} />);

			fireEvent.click(screen.getByLabelText('Clear input'));

			expect(handleChange).toHaveBeenCalledWith('');
		});

		it('should not show clear button when disabled', () => {
			render(<Input name="test" value="Something" clearable disabled onChange={jest.fn()} />);

			expect(screen.queryByLabelText('Clear input')).not.toBeInTheDocument();
		});
	});

	describe('character count', () => {
		it('should show character count when maxLength is provided', () => {
			render(<Input name="test" value="Hello" maxLength={100} onChange={jest.fn()} />);

			expect(screen.getByText('5/100')).toBeInTheDocument();
		});
	});

	describe('textarea mode', () => {
		it('should render textarea when as="textarea"', () => {
			render(<Input name="test" as="textarea" />);

			const textarea = document.querySelector('textarea');
			expect(textarea).toBeInTheDocument();
		});

		it('should apply rows attribute to textarea', () => {
			render(<Input name="test" as="textarea" rows={5} />);

			const textarea = document.querySelector('textarea');
			expect(textarea).toHaveAttribute('rows', '5');
		});
	});

	describe('icons', () => {
		it('should render left icon when provided', () => {
			render(<Input name="test" iconLeft={<span data-testid="left-icon">L</span>} />);

			expect(screen.getByTestId('left-icon')).toBeInTheDocument();
		});

		it('should render right icon when provided', () => {
			render(<Input name="test" iconRight={<span data-testid="right-icon">R</span>} />);

			expect(screen.getByTestId('right-icon')).toBeInTheDocument();
		});
	});

	describe('additional props', () => {
		it('should apply custom className', () => {
			const { container } = render(<Input name="test" className="custom-input" />);

			expect(container.firstChild).toHaveClass('custom-input');
		});

		it('should apply fullWidth class', () => {
			const { container } = render(<Input name="test" fullWidth />);

			expect(container.firstChild).toHaveClass('input--full-width');
		});

		it('should apply custom ariaLabel', () => {
			render(<Input name="test" ariaLabel="Search query" />);

			expect(screen.getByRole('textbox')).toHaveAttribute('aria-label', 'Search query');
		});

		it('should use label as aria-label when ariaLabel not provided', () => {
			render(<Input name="test" label="Username" />);

			expect(screen.getByRole('textbox')).toHaveAttribute('aria-label', 'Username');
		});
	});
});
