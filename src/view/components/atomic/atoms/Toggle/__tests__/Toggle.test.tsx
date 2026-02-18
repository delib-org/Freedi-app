/**
 * Tests for Toggle atomic component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Toggle from '../Toggle';

describe('Toggle', () => {
	describe('rendering', () => {
		it('should render toggle checkbox', () => {
			render(<Toggle checked={false} onChange={() => {}} />);

			expect(screen.getByRole('checkbox')).toBeInTheDocument();
		});

		it('should render with default classes', () => {
			render(<Toggle checked={false} onChange={() => {}} />);

			const container = screen.getByRole('checkbox').closest('.toggle');
			expect(container).toBeInTheDocument();
		});

		it('should render toggle track element', () => {
			const { container } = render(<Toggle checked={false} onChange={() => {}} />);

			expect(container.querySelector('.toggle__track')).toBeInTheDocument();
		});
	});

	describe('checked state', () => {
		it('should be unchecked by default when checked is false', () => {
			render(<Toggle checked={false} onChange={() => {}} />);

			expect(screen.getByRole('checkbox')).not.toBeChecked();
		});

		it('should be checked when checked is true', () => {
			render(<Toggle checked={true} onChange={() => {}} />);

			expect(screen.getByRole('checkbox')).toBeChecked();
		});

		it('should have checked checkbox when checked prop is true', () => {
			render(<Toggle checked={true} onChange={() => {}} />);

			// Component uses CSS :checked pseudo-class for styling, not a class
			expect(screen.getByRole('checkbox')).toBeChecked();
		});

		it('should have unchecked checkbox when checked prop is false', () => {
			render(<Toggle checked={false} onChange={() => {}} />);

			expect(screen.getByRole('checkbox')).not.toBeChecked();
		});
	});

	describe('interactions', () => {
		it('should call onChange when clicked', () => {
			const handleChange = jest.fn();
			render(<Toggle checked={false} onChange={handleChange} />);

			fireEvent.click(screen.getByRole('checkbox'));

			expect(handleChange).toHaveBeenCalledTimes(1);
		});

		it('should pass new value to onChange', () => {
			const handleChange = jest.fn();
			render(<Toggle checked={false} onChange={handleChange} />);

			fireEvent.click(screen.getByRole('checkbox'));

			expect(handleChange).toHaveBeenCalledWith(true);
		});

		it('should pass false to onChange when unchecking', () => {
			const handleChange = jest.fn();
			render(<Toggle checked={true} onChange={handleChange} />);

			fireEvent.click(screen.getByRole('checkbox'));

			expect(handleChange).toHaveBeenCalledWith(false);
		});
	});

	describe('disabled state', () => {
		it('should be disabled when disabled prop is true', () => {
			render(<Toggle checked={false} onChange={() => {}} disabled />);

			expect(screen.getByRole('checkbox')).toBeDisabled();
		});

		it('should not call onChange when disabled', () => {
			const handleChange = jest.fn();
			render(<Toggle checked={false} onChange={handleChange} disabled />);

			fireEvent.click(screen.getByRole('checkbox'));

			expect(handleChange).not.toHaveBeenCalled();
		});

		it('should apply disabled class when disabled', () => {
			const { container } = render(<Toggle checked={false} onChange={() => {}} disabled />);

			expect(container.querySelector('.toggle--disabled')).toBeInTheDocument();
		});
	});

	describe('label', () => {
		it('should render label when provided', () => {
			render(<Toggle checked={false} onChange={() => {}} label="Toggle Label" />);

			expect(screen.getByText('Toggle Label')).toBeInTheDocument();
		});

		it('should render label in toggle__label element', () => {
			render(<Toggle checked={false} onChange={() => {}} label="Toggle Label" />);

			expect(screen.getByText('Toggle Label')).toHaveClass('toggle__label');
		});

		it('should not render label element when no label provided', () => {
			const { container } = render(<Toggle checked={false} onChange={() => {}} />);

			expect(container.querySelector('.toggle__label')).not.toBeInTheDocument();
		});

		it('should be clickable via label', () => {
			const handleChange = jest.fn();
			render(<Toggle checked={false} onChange={handleChange} label="Click me" />);

			fireEvent.click(screen.getByText('Click me'));

			expect(handleChange).toHaveBeenCalled();
		});
	});

	describe('hint', () => {
		it('should render hint when provided', () => {
			render(<Toggle checked={false} onChange={() => {}} hint="Helpful hint" />);

			expect(screen.getByText('Helpful hint')).toBeInTheDocument();
		});

		it('should render hint in toggle__hint element', () => {
			render(<Toggle checked={false} onChange={() => {}} hint="Helpful hint" />);

			expect(screen.getByText('Helpful hint')).toHaveClass('toggle__hint');
		});

		it('should not render hint element when no hint provided', () => {
			const { container } = render(<Toggle checked={false} onChange={() => {}} />);

			expect(container.querySelector('.toggle__hint')).not.toBeInTheDocument();
		});
	});

	describe('sizes', () => {
		it('should apply small size class', () => {
			const { container } = render(<Toggle checked={false} onChange={() => {}} size="small" />);

			expect(container.querySelector('.toggle--small')).toBeInTheDocument();
		});

		it('should not apply size class for medium (default)', () => {
			const { container } = render(<Toggle checked={false} onChange={() => {}} />);

			// Medium is default, so no size modifier class is added
			const toggle = container.querySelector('.toggle');
			expect(toggle).not.toHaveClass('toggle--small');
			expect(toggle).not.toHaveClass('toggle--medium');
			expect(toggle).not.toHaveClass('toggle--large');
		});

		it('should apply large size class', () => {
			const { container } = render(<Toggle checked={false} onChange={() => {}} size="large" />);

			expect(container.querySelector('.toggle--large')).toBeInTheDocument();
		});
	});

	describe('variants', () => {
		it('should apply success variant class', () => {
			const { container } = render(
				<Toggle checked={false} onChange={() => {}} variant="success" />,
			);

			expect(container.querySelector('.toggle--success')).toBeInTheDocument();
		});

		it('should apply warning variant class', () => {
			const { container } = render(
				<Toggle checked={false} onChange={() => {}} variant="warning" />,
			);

			expect(container.querySelector('.toggle--warning')).toBeInTheDocument();
		});

		it('should not apply variant class for default', () => {
			const { container } = render(<Toggle checked={false} onChange={() => {}} />);

			const toggle = container.querySelector('.toggle');
			expect(toggle).not.toHaveClass('toggle--success');
			expect(toggle).not.toHaveClass('toggle--warning');
		});
	});

	describe('accessibility', () => {
		it('should have accessible name from label', () => {
			render(<Toggle checked={false} onChange={() => {}} label="Toggle feature" />);

			expect(screen.getByRole('checkbox', { name: /toggle feature/i })).toBeInTheDocument();
		});

		it('should support ariaLabel prop', () => {
			render(<Toggle checked={false} onChange={() => {}} ariaLabel="Custom aria label" />);

			expect(screen.getByRole('checkbox')).toHaveAttribute('aria-label', 'Custom aria label');
		});

		it('should use label as aria-label when ariaLabel not provided', () => {
			render(<Toggle checked={false} onChange={() => {}} label="Toggle Label" />);

			expect(screen.getByRole('checkbox')).toHaveAttribute('aria-label', 'Toggle Label');
		});
	});

	describe('additional props', () => {
		it('should apply custom className', () => {
			const { container } = render(
				<Toggle checked={false} onChange={() => {}} className="custom-class" />,
			);

			expect(container.querySelector('.custom-class')).toBeInTheDocument();
		});

		it('should pass through id to checkbox', () => {
			render(<Toggle checked={false} onChange={() => {}} id="custom-id" />);

			expect(screen.getByRole('checkbox')).toHaveAttribute('id', 'custom-id');
		});

		it('should pass through name attribute', () => {
			render(<Toggle checked={false} onChange={() => {}} name="toggle-name" />);

			expect(screen.getByRole('checkbox')).toHaveAttribute('name', 'toggle-name');
		});
	});
});
