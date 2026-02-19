/**
 * Tests for Tooltip atomic component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Tooltip from '../Tooltip';

describe('Tooltip', () => {
	describe('rendering', () => {
		it('should render children', () => {
			render(
				<Tooltip content="Tip text">
					<button>Hover me</button>
				</Tooltip>,
			);

			expect(screen.getByText('Hover me')).toBeInTheDocument();
		});

		it('should render with default BEM classes', () => {
			const { container } = render(
				<Tooltip content="Tip text">
					<span>Trigger</span>
				</Tooltip>,
			);

			const wrapper = container.firstChild as HTMLElement;
			expect(wrapper).toHaveClass('tooltip');
			expect(wrapper).toHaveClass('tooltip--top'); // default position
		});

		it('should not show tooltip content initially', () => {
			render(
				<Tooltip content="Hidden tip">
					<span>Trigger</span>
				</Tooltip>,
			);

			expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
		});
	});

	describe('positions', () => {
		it('should apply top position class by default', () => {
			const { container } = render(
				<Tooltip content="Tip">
					<span>Trigger</span>
				</Tooltip>,
			);

			expect(container.firstChild).toHaveClass('tooltip--top');
		});

		it('should apply bottom position class', () => {
			const { container } = render(
				<Tooltip content="Tip" position="bottom">
					<span>Trigger</span>
				</Tooltip>,
			);

			expect(container.firstChild).toHaveClass('tooltip--bottom');
		});

		it('should apply left position class', () => {
			const { container } = render(
				<Tooltip content="Tip" position="left">
					<span>Trigger</span>
				</Tooltip>,
			);

			expect(container.firstChild).toHaveClass('tooltip--left');
		});

		it('should apply right position class', () => {
			const { container } = render(
				<Tooltip content="Tip" position="right">
					<span>Trigger</span>
				</Tooltip>,
			);

			expect(container.firstChild).toHaveClass('tooltip--right');
		});

		it('should apply compound position classes', () => {
			const { container } = render(
				<Tooltip content="Tip" position="top-right">
					<span>Trigger</span>
				</Tooltip>,
			);

			expect(container.firstChild).toHaveClass('tooltip--top-right');
		});
	});

	describe('variants', () => {
		it('should not add variant class for dark (default)', () => {
			const { container } = render(
				<Tooltip content="Tip">
					<span>Trigger</span>
				</Tooltip>,
			);

			expect(container.firstChild).not.toHaveClass('tooltip--light');
			expect(container.firstChild).not.toHaveClass('tooltip--dark');
		});

		it('should apply light variant class', () => {
			const { container } = render(
				<Tooltip content="Tip" variant="light">
					<span>Trigger</span>
				</Tooltip>,
			);

			expect(container.firstChild).toHaveClass('tooltip--light');
		});
	});

	describe('hover interaction (desktop)', () => {
		beforeEach(() => {
			// Simulate desktop viewport
			Object.defineProperty(window, 'innerWidth', {
				writable: true,
				configurable: true,
				value: 1024,
			});
			window.dispatchEvent(new Event('resize'));
		});

		it('should show tooltip on mouse enter', () => {
			const { container } = render(
				<Tooltip content="Visible tip">
					<span>Trigger</span>
				</Tooltip>,
			);

			fireEvent.mouseEnter(container.firstChild as HTMLElement);

			expect(screen.getByRole('tooltip')).toBeInTheDocument();
			expect(screen.getByText('Visible tip')).toBeInTheDocument();
		});

		it('should hide tooltip on mouse leave', () => {
			const { container } = render(
				<Tooltip content="Disappearing tip">
					<span>Trigger</span>
				</Tooltip>,
			);

			fireEvent.mouseEnter(container.firstChild as HTMLElement);
			expect(screen.getByRole('tooltip')).toBeInTheDocument();

			fireEvent.mouseLeave(container.firstChild as HTMLElement);
			expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
		});

		it('should render tooltip content with correct class', () => {
			const { container } = render(
				<Tooltip content="Styled tip">
					<span>Trigger</span>
				</Tooltip>,
			);

			fireEvent.mouseEnter(container.firstChild as HTMLElement);

			const tooltipContent = screen.getByRole('tooltip');
			expect(tooltipContent).toHaveClass('tooltip__content');
		});

		it('should render arrow element', () => {
			const { container } = render(
				<Tooltip content="With arrow">
					<span>Trigger</span>
				</Tooltip>,
			);

			fireEvent.mouseEnter(container.firstChild as HTMLElement);

			const tooltipContent = screen.getByRole('tooltip');
			const arrow = tooltipContent.querySelector('.tooltip__arrow');
			expect(arrow).toBeInTheDocument();
		});
	});

	describe('additional props', () => {
		it('should apply custom className', () => {
			const { container } = render(
				<Tooltip content="Tip" className="custom-tooltip">
					<span>Trigger</span>
				</Tooltip>,
			);

			expect(container.firstChild).toHaveClass('custom-tooltip');
		});

		it('should apply id attribute', () => {
			const { container } = render(
				<Tooltip content="Tip" id="my-tooltip">
					<span>Trigger</span>
				</Tooltip>,
			);

			expect(container.firstChild).toHaveAttribute('id', 'my-tooltip');
		});
	});
});
