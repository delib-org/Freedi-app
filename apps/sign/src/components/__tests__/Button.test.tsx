/**
 * Tests for Button component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Button, { ButtonProps } from '../shared/Button';

// Mock CSS modules
jest.mock('../shared/Button.module.scss', () => ({
	button: 'button',
	'button--primary': 'button--primary',
	'button--secondary': 'button--secondary',
	'button--agree': 'button--agree',
	'button--disagree': 'button--disagree',
	'button--ghost': 'button--ghost',
	'button--small': 'button--small',
	'button--medium': 'button--medium',
	'button--large': 'button--large',
	'button--fullWidth': 'button--fullWidth',
	'button--loading': 'button--loading',
	spinner: 'spinner',
	hiddenText: 'hiddenText',
}));

describe('Button', () => {
	const defaultProps: ButtonProps = {
		children: 'Click me',
	};

	it('renders with children text', () => {
		render(<Button {...defaultProps} />);
		expect(screen.getByText('Click me')).toBeInTheDocument();
	});

	it('renders as button element with type="button"', () => {
		render(<Button {...defaultProps} />);
		const button = screen.getByRole('button');
		expect(button).toHaveAttribute('type', 'button');
	});

	describe('variants', () => {
		it('applies primary variant by default', () => {
			render(<Button {...defaultProps} />);
			expect(screen.getByRole('button')).toHaveClass('button--primary');
		});

		it('applies secondary variant', () => {
			render(<Button {...defaultProps} variant="secondary" />);
			expect(screen.getByRole('button')).toHaveClass('button--secondary');
		});

		it('applies agree variant', () => {
			render(<Button {...defaultProps} variant="agree" />);
			expect(screen.getByRole('button')).toHaveClass('button--agree');
		});

		it('applies disagree variant', () => {
			render(<Button {...defaultProps} variant="disagree" />);
			expect(screen.getByRole('button')).toHaveClass('button--disagree');
		});

		it('applies ghost variant', () => {
			render(<Button {...defaultProps} variant="ghost" />);
			expect(screen.getByRole('button')).toHaveClass('button--ghost');
		});
	});

	describe('sizes', () => {
		it('applies medium size by default', () => {
			render(<Button {...defaultProps} />);
			expect(screen.getByRole('button')).toHaveClass('button--medium');
		});

		it('applies small size', () => {
			render(<Button {...defaultProps} size="small" />);
			expect(screen.getByRole('button')).toHaveClass('button--small');
		});

		it('applies large size', () => {
			render(<Button {...defaultProps} size="large" />);
			expect(screen.getByRole('button')).toHaveClass('button--large');
		});
	});

	describe('fullWidth', () => {
		it('does not apply fullWidth class by default', () => {
			render(<Button {...defaultProps} />);
			expect(screen.getByRole('button')).not.toHaveClass('button--fullWidth');
		});

		it('applies fullWidth class when prop is true', () => {
			render(<Button {...defaultProps} fullWidth />);
			expect(screen.getByRole('button')).toHaveClass('button--fullWidth');
		});
	});

	describe('loading state', () => {
		it('is not loading by default', () => {
			render(<Button {...defaultProps} />);
			expect(screen.getByRole('button')).not.toHaveClass('button--loading');
		});

		it('applies loading class when loading', () => {
			render(<Button {...defaultProps} loading />);
			expect(screen.getByRole('button')).toHaveClass('button--loading');
		});

		it('disables button when loading', () => {
			render(<Button {...defaultProps} loading />);
			expect(screen.getByRole('button')).toBeDisabled();
		});

		it('shows spinner when loading', () => {
			render(<Button {...defaultProps} loading />);
			expect(screen.getByRole('button').querySelector('.spinner')).toBeInTheDocument();
		});

		it('hides text visually when loading', () => {
			render(<Button {...defaultProps} loading />);
			expect(screen.getByText('Click me')).toHaveClass('hiddenText');
		});
	});

	describe('disabled state', () => {
		it('is not disabled by default', () => {
			render(<Button {...defaultProps} />);
			expect(screen.getByRole('button')).not.toBeDisabled();
		});

		it('is disabled when disabled prop is true', () => {
			render(<Button {...defaultProps} disabled />);
			expect(screen.getByRole('button')).toBeDisabled();
		});

		it('is disabled when loading even without disabled prop', () => {
			render(<Button {...defaultProps} loading />);
			expect(screen.getByRole('button')).toBeDisabled();
		});
	});

	describe('click handling', () => {
		it('calls onClick handler when clicked', () => {
			const handleClick = jest.fn();
			render(<Button {...defaultProps} onClick={handleClick} />);

			fireEvent.click(screen.getByRole('button'));

			expect(handleClick).toHaveBeenCalledTimes(1);
		});

		it('does not call onClick when disabled', () => {
			const handleClick = jest.fn();
			render(<Button {...defaultProps} onClick={handleClick} disabled />);

			fireEvent.click(screen.getByRole('button'));

			expect(handleClick).not.toHaveBeenCalled();
		});

		it('does not call onClick when loading', () => {
			const handleClick = jest.fn();
			render(<Button {...defaultProps} onClick={handleClick} loading />);

			fireEvent.click(screen.getByRole('button'));

			expect(handleClick).not.toHaveBeenCalled();
		});
	});

	describe('custom className', () => {
		it('applies custom className along with default classes', () => {
			render(<Button {...defaultProps} className="custom-class" />);
			const button = screen.getByRole('button');
			expect(button).toHaveClass('button');
			expect(button).toHaveClass('custom-class');
		});
	});

	describe('additional props', () => {
		it('passes additional props to button element', () => {
			render(<Button {...defaultProps} data-testid="custom-button" aria-label="Custom label" />);
			const button = screen.getByRole('button');
			expect(button).toHaveAttribute('data-testid', 'custom-button');
			expect(button).toHaveAttribute('aria-label', 'Custom label');
		});
	});
});
