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
			expect(button).toHaveClass('button--medium');
		});

		it('should render children when provided instead of text', () => {
			render(
				<Button>
					<span data-testid="child">Custom Child</span>
				</Button>
			);

			expect(screen.getByTestId('child')).toBeInTheDocument();
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

		it('should apply text variant class', () => {
			render(<Button text="Text" variant="text" />);

			expect(screen.getByRole('button')).toHaveClass('button--text');
		});

		it('should not apply variant class for default variant', () => {
			render(<Button text="Default" variant="default" />);

			const button = screen.getByRole('button');
			expect(button).not.toHaveClass('button--default');
		});
	});

	describe('sizes', () => {
		it('should apply small size class', () => {
			render(<Button text="Small" size="small" />);

			expect(screen.getByRole('button')).toHaveClass('button--small');
		});

		it('should apply medium size class by default', () => {
			render(<Button text="Medium" />);

			expect(screen.getByRole('button')).toHaveClass('button--medium');
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

		it('should apply icon-only class when no text and has icon', () => {
			const icon = <span data-testid="icon">Icon</span>;
			render(<Button icon={icon} />);

			expect(screen.getByRole('button')).toHaveClass('button--icon-only');
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

		it('should pass through aria-label', () => {
			render(<Button text="Action" aria-label="Perform action" />);

			expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Perform action');
		});

		it('should pass through data attributes', () => {
			render(<Button text="Data" data-testid="custom-button" />);

			expect(screen.getByTestId('custom-button')).toBeInTheDocument();
		});
	});

	describe('text display', () => {
		it('should render text in button__text span', () => {
			render(<Button text="Button Text" />);

			const textSpan = screen.getByText('Button Text');
			expect(textSpan).toHaveClass('button__text');
		});

		it('should not render text span when no text provided', () => {
			const icon = <span data-testid="icon">Icon</span>;
			render(<Button icon={icon} />);

			expect(screen.queryByText(/./)).toBeNull();
		});
	});
});
