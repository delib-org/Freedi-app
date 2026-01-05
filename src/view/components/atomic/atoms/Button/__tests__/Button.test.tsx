/**
 * Tests for Button atomic component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Button from '../Button';

describe('Button', () => {
	describe('rendering', () => {
		it('should render button with text', () => {
			render(<Button text="Click me" />);

			expect(screen.getByRole('button')).toBeInTheDocument();
			expect(screen.getByText('Click me')).toBeInTheDocument();
		});

		it('should render with default classes', () => {
			render(<Button text="Test" />);

			const button = screen.getByRole('button');
			expect(button).toHaveClass('button');
			// Component doesn't add button--medium for default size
			expect(button).toHaveClass('button--primary'); // default variant
		});

		it('should render text prop in button__text span', () => {
			render(<Button text="Custom Text" />);

			const textSpan = screen.getByText('Custom Text');
			expect(textSpan).toHaveClass('button__text');
		});
	});

	describe('variants', () => {
		it('should apply primary variant class', () => {
			render(<Button text="Primary" variant="primary" />);

			expect(screen.getByRole('button')).toHaveClass('button--primary');
		});

		it('should apply secondary variant class', () => {
			render(<Button text="Secondary" variant="secondary" />);

			expect(screen.getByRole('button')).toHaveClass('button--secondary');
		});

		it('should apply agree variant class', () => {
			render(<Button text="Agree" variant="agree" />);

			expect(screen.getByRole('button')).toHaveClass('button--agree');
		});

		it('should apply disagree variant class', () => {
			render(<Button text="Disagree" variant="disagree" />);

			expect(screen.getByRole('button')).toHaveClass('button--disagree');
		});

		it('should apply cancel variant class', () => {
			render(<Button text="Cancel" variant="cancel" />);

			expect(screen.getByRole('button')).toHaveClass('button--cancel');
		});

		it('should apply primary variant by default', () => {
			render(<Button text="Default" />);

			const button = screen.getByRole('button');
			expect(button).toHaveClass('button--primary');
		});
	});

	describe('sizes', () => {
		it('should apply small size class', () => {
			render(<Button text="Small" size="small" />);

			expect(screen.getByRole('button')).toHaveClass('button--small');
		});

		it('should not add size class for medium (default)', () => {
			render(<Button text="Medium" />);

			const button = screen.getByRole('button');
			// Medium is default, no explicit size class added
			expect(button).not.toHaveClass('button--small');
			expect(button).not.toHaveClass('button--large');
			expect(button).not.toHaveClass('button--medium');
		});

		it('should apply large size class', () => {
			render(<Button text="Large" size="large" />);

			expect(screen.getByRole('button')).toHaveClass('button--large');
		});

		it('should not apply medium class when different size specified', () => {
			render(<Button text="Small" size="small" />);

			expect(screen.getByRole('button')).not.toHaveClass('button--medium');
		});
	});

	describe('states', () => {
		it('should apply disabled attribute when disabled', () => {
			render(<Button text="Disabled" disabled />);

			expect(screen.getByRole('button')).toBeDisabled();
		});

		it('should apply disabled class when disabled', () => {
			render(<Button text="Disabled" disabled />);

			expect(screen.getByRole('button')).toHaveClass('button--disabled');
		});

		it('should apply loading class when loading', () => {
			render(<Button text="Loading" loading />);

			expect(screen.getByRole('button')).toHaveClass('button--loading');
		});

		it('should be disabled when loading', () => {
			render(<Button text="Loading" loading />);

			expect(screen.getByRole('button')).toBeDisabled();
		});

		it('should apply fullWidth class when fullWidth is true', () => {
			render(<Button text="Full Width" fullWidth />);

			expect(screen.getByRole('button')).toHaveClass('button--full-width');
		});
	});

	describe('interactions', () => {
		it('should call onClick when clicked', () => {
			const handleClick = jest.fn();
			render(<Button text="Click" onClick={handleClick} />);

			fireEvent.click(screen.getByRole('button'));

			expect(handleClick).toHaveBeenCalledTimes(1);
		});

		it('should not call onClick when disabled', () => {
			const handleClick = jest.fn();
			render(<Button text="Click" onClick={handleClick} disabled />);

			fireEvent.click(screen.getByRole('button'));

			expect(handleClick).not.toHaveBeenCalled();
		});

		it('should not call onClick when loading', () => {
			const handleClick = jest.fn();
			render(<Button text="Click" onClick={handleClick} loading />);

			fireEvent.click(screen.getByRole('button'));

			expect(handleClick).not.toHaveBeenCalled();
		});
	});

	describe('icon', () => {
		it('should render icon when provided', () => {
			const icon = <span data-testid="icon">Icon</span>;
			render(<Button text="With Icon" icon={icon} />);

			expect(screen.getByTestId('icon')).toBeInTheDocument();
		});

		it('should render icon inside button__icon wrapper', () => {
			const icon = <span data-testid="icon">Icon</span>;
			render(<Button text="With Icon" icon={icon} />);

			const iconWrapper = screen.getByTestId('icon').parentElement;
			expect(iconWrapper).toHaveClass('button__icon');
		});

		it('should render icon alongside text', () => {
			const icon = <span data-testid="icon">Icon</span>;
			render(<Button text="With Icon" icon={icon} />);

			// Icon and text should both be present
			expect(screen.getByTestId('icon')).toBeInTheDocument();
			expect(screen.getByText('With Icon')).toBeInTheDocument();
		});
	});

	describe('button types', () => {
		it('should have type button by default', () => {
			render(<Button text="Default" />);

			expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
		});

		it('should allow submit type', () => {
			render(<Button text="Submit" type="submit" />);

			expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
		});

		it('should allow reset type', () => {
			render(<Button text="Reset" type="reset" />);

			expect(screen.getByRole('button')).toHaveAttribute('type', 'reset');
		});
	});

	describe('additional props', () => {
		it('should apply custom className', () => {
			render(<Button text="Custom" className="custom-class" />);

			expect(screen.getByRole('button')).toHaveClass('custom-class');
		});

		it('should pass ariaLabel prop to aria-label attribute', () => {
			render(<Button text="Action" ariaLabel="Perform action" />);

			expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Perform action');
		});

		it('should use text as aria-label when ariaLabel not provided', () => {
			render(<Button text="Button Text" />);

			expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Button Text');
		});
	});

	describe('text display', () => {
		it('should render text in button__text span', () => {
			render(<Button text="Button Text" />);

			const textSpan = screen.getByText('Button Text');
			expect(textSpan).toHaveClass('button__text');
		});

		it('should always render text span even when empty', () => {
			render(<Button text="" />);

			// Component always renders button__text span
			const button = screen.getByRole('button');
			expect(button.querySelector('.button__text')).toBeInTheDocument();
		});
	});
});
