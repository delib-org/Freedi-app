/**
 * Tests for FAB (Floating Action Button) atomic component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FAB from '../FAB';

describe('FAB', () => {
	describe('rendering', () => {
		it('should render FAB button', () => {
			render(<FAB ariaLabel="Add item">+</FAB>);

			expect(screen.getByRole('button')).toBeInTheDocument();
		});

		it('should render with fab class', () => {
			render(<FAB ariaLabel="Add item">+</FAB>);

			expect(screen.getByRole('button')).toHaveClass('fab');
		});

		it('should render children in fab__inner wrapper', () => {
			const { container } = render(<FAB ariaLabel="Add item"><span data-testid="icon">+</span></FAB>);

			const inner = container.querySelector('.fab__inner');
			expect(inner).toBeInTheDocument();
			expect(inner).toContainElement(screen.getByTestId('icon'));
		});

		it('should have type button', () => {
			render(<FAB ariaLabel="Add item">+</FAB>);

			expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
		});
	});

	describe('modifiers', () => {
		it('should apply blink class when blink is true', () => {
			render(<FAB ariaLabel="Add item" blink>+</FAB>);

			expect(screen.getByRole('button')).toHaveClass('fab--blink');
		});

		it('should not apply blink class when blink is false', () => {
			render(<FAB ariaLabel="Add item" blink={false}>+</FAB>);

			expect(screen.getByRole('button')).not.toHaveClass('fab--blink');
		});

		it('should apply fixed class when fixed is true', () => {
			render(<FAB ariaLabel="Add item" fixed>+</FAB>);

			expect(screen.getByRole('button')).toHaveClass('fab--fixed');
		});

		it('should not apply fixed class when fixed is false', () => {
			render(<FAB ariaLabel="Add item" fixed={false}>+</FAB>);

			expect(screen.getByRole('button')).not.toHaveClass('fab--fixed');
		});

		it('should apply up class when up is true', () => {
			render(<FAB ariaLabel="Add item" up>+</FAB>);

			expect(screen.getByRole('button')).toHaveClass('fab--up');
		});

		it('should not apply up class when up is false', () => {
			render(<FAB ariaLabel="Add item" up={false}>+</FAB>);

			expect(screen.getByRole('button')).not.toHaveClass('fab--up');
		});

		it('should apply multiple modifiers', () => {
			render(<FAB ariaLabel="Add item" blink fixed up>+</FAB>);

			const button = screen.getByRole('button');
			expect(button).toHaveClass('fab--blink');
			expect(button).toHaveClass('fab--fixed');
			expect(button).toHaveClass('fab--up');
		});
	});

	describe('interactions', () => {
		it('should call onClick when clicked', () => {
			const handleClick = jest.fn();
			render(<FAB ariaLabel="Add item" onClick={handleClick}>+</FAB>);

			fireEvent.click(screen.getByRole('button'));

			expect(handleClick).toHaveBeenCalledTimes(1);
		});

		it('should pass event to onClick handler', () => {
			const handleClick = jest.fn();
			render(<FAB ariaLabel="Add item" onClick={handleClick}>+</FAB>);

			fireEvent.click(screen.getByRole('button'));

			expect(handleClick).toHaveBeenCalledWith(expect.any(Object));
		});

		it('should not throw when clicked without onClick handler', () => {
			render(<FAB ariaLabel="Add item">+</FAB>);

			expect(() => {
				fireEvent.click(screen.getByRole('button'));
			}).not.toThrow();
		});
	});

	describe('accessibility', () => {
		it('should have aria-label for accessibility', () => {
			render(<FAB ariaLabel="Add new item">+</FAB>);

			expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Add new item');
		});

		it('should be accessible by aria-label', () => {
			render(<FAB ariaLabel="Create document">+</FAB>);

			expect(screen.getByRole('button', { name: 'Create document' })).toBeInTheDocument();
		});

		it('should have default tabIndex when not specified', () => {
			render(<FAB ariaLabel="Add item">+</FAB>);

			expect(screen.getByRole('button')).not.toHaveAttribute('tabindex');
		});

		it('should apply custom tabIndex', () => {
			render(<FAB ariaLabel="Add item" tabIndex={-1}>+</FAB>);

			expect(screen.getByRole('button')).toHaveAttribute('tabindex', '-1');
		});
	});

	describe('additional props', () => {
		it('should apply custom className', () => {
			render(<FAB ariaLabel="Add item" className="custom-fab">+</FAB>);

			expect(screen.getByRole('button')).toHaveClass('custom-fab');
		});

		it('should preserve fab class with custom className', () => {
			render(<FAB ariaLabel="Add item" className="custom-fab">+</FAB>);

			const button = screen.getByRole('button');
			expect(button).toHaveClass('fab');
			expect(button).toHaveClass('custom-fab');
		});

		it('should apply id attribute', () => {
			render(<FAB ariaLabel="Add item" id="my-fab">+</FAB>);

			expect(screen.getByRole('button')).toHaveAttribute('id', 'my-fab');
		});
	});

	describe('children content', () => {
		it('should render text children', () => {
			render(<FAB ariaLabel="Add">+</FAB>);

			expect(screen.getByText('+')).toBeInTheDocument();
		});

		it('should render icon components as children', () => {
			render(
				<FAB ariaLabel="Add item">
					<svg data-testid="icon-svg"><path /></svg>
				</FAB>
			);

			expect(screen.getByTestId('icon-svg')).toBeInTheDocument();
		});

		it('should render complex children', () => {
			render(
				<FAB ariaLabel="Add item">
					<span className="icon">
						<img src="icon.svg" alt="icon" />
					</span>
				</FAB>
			);

			expect(screen.getByRole('img')).toBeInTheDocument();
		});
	});
});
