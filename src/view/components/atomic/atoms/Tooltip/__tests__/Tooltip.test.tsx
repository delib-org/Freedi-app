/**
 * Tests for Tooltip atomic component
 */

import React from 'react';
import { render, screen, fireEvent, createEvent } from '@testing-library/react';
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

	describe('touch (whatever the screen width)', () => {
		const pointer = (
			target: Element,
			type: 'pointerOver' | 'pointerDown',
			pointerType: string,
		): void => {
			const event = createEvent[type](target);
			Object.defineProperty(event, 'pointerType', { value: pointerType });
			fireEvent(target, event);
		};

		/** What a browser sends for one finger tap, emulated mouse events included. */
		const tap = (target: Element): void => {
			pointer(target, 'pointerOver', 'touch');
			pointer(target, 'pointerDown', 'touch');
			fireEvent.mouseEnter(target);
			fireEvent.focus(target);
			fireEvent.click(target, { detail: 1 });
		};

		beforeEach(() => {
			Object.defineProperty(window, 'innerWidth', {
				writable: true,
				configurable: true,
				value: 1280,
			});
		});

		const renderFocusable = (): HTMLElement => {
			render(
				<Tooltip content="Explained" focusable>
					<span>42</span>
				</Tooltip>,
			);

			return screen.getByRole('button');
		};

		it('opens on a tap on a wide touch screen and stays open', () => {
			tap(renderFocusable());

			expect(screen.getByRole('tooltip')).toHaveTextContent('Explained');
		});

		it('closes on a second tap', () => {
			const trigger = renderFocusable();

			tap(trigger);
			tap(trigger);

			expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
		});

		it('closes on a tap elsewhere', () => {
			tap(renderFocusable());

			fireEvent.pointerDown(document.body);

			expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
		});
	});

	describe('mouse', () => {
		it('a click does not close what hover opened', () => {
			render(
				<Tooltip content="Explained" focusable>
					<span>42</span>
				</Tooltip>,
			);
			const trigger = screen.getByRole('button');
			const enter = createEvent.pointerOver(trigger);
			Object.defineProperty(enter, 'pointerType', { value: 'mouse' });
			fireEvent(trigger, enter);
			fireEvent.mouseEnter(trigger);

			fireEvent.click(trigger, { detail: 1 });

			expect(screen.getByRole('tooltip')).toBeInTheDocument();
		});

		it('Escape closes what hover opened, with focus elsewhere', () => {
			const { container } = render(
				<Tooltip content="Explained">
					<span>42</span>
				</Tooltip>,
			);
			fireEvent.mouseEnter(container.firstChild as HTMLElement);
			expect(screen.getByRole('tooltip')).toBeInTheDocument();

			fireEvent.keyDown(document.body, { key: 'Escape' });

			expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
		});

		it('other keys leave it open', () => {
			const { container } = render(
				<Tooltip content="Explained">
					<span>42</span>
				</Tooltip>,
			);
			fireEvent.mouseEnter(container.firstChild as HTMLElement);

			fireEvent.keyDown(document.body, { key: 'a' });

			expect(screen.getByRole('tooltip')).toBeInTheDocument();
		});

		it('Escape on an open tooltip does not reach a modal listening on the document', () => {
			const onModalEscape = jest.fn();
			document.addEventListener('keydown', onModalEscape);
			const { container } = render(
				<Tooltip content="Explained">
					<span>42</span>
				</Tooltip>,
			);
			fireEvent.mouseEnter(container.firstChild as HTMLElement);

			fireEvent.keyDown(document.body, { key: 'Escape' });
			document.removeEventListener('keydown', onModalEscape);

			expect(onModalEscape).not.toHaveBeenCalled();
		});
	});

	describe('keyboard', () => {
		const renderFocusable = (): HTMLElement => {
			render(
				<Tooltip content="Explained" focusable>
					<span>42</span>
				</Tooltip>,
			);

			return screen.getByRole('button');
		};

		it('a focusable trigger is a real button', () => {
			const trigger = renderFocusable();

			expect(trigger.tagName).toBe('BUTTON');
			expect(trigger).toHaveAttribute('type', 'button');
		});

		it('opens on focus and is linked to the trigger', () => {
			const trigger = renderFocusable();

			fireEvent.focus(trigger);

			expect(trigger).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id);
		});

		it('closes on blur', () => {
			const trigger = renderFocusable();

			fireEvent.focus(trigger);
			fireEvent.blur(trigger);

			expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
			expect(trigger).not.toHaveAttribute('aria-describedby');
		});

		it('closes on Escape', () => {
			const trigger = renderFocusable();

			fireEvent.focus(trigger);
			fireEvent.keyDown(trigger, { key: 'Escape' });

			expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
		});

		it('toggles with Enter (a click with no pointer)', () => {
			const trigger = renderFocusable();

			fireEvent.focus(trigger);
			fireEvent.click(trigger);
			expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

			fireEvent.click(trigger);
			expect(screen.getByRole('tooltip')).toBeInTheDocument();
		});

		it('a focusable trigger keeps its tap away from a clickable parent', () => {
			const onParentClick = jest.fn();
			render(
				<div onClick={onParentClick}>
					<Tooltip content="Explained" focusable>
						<span>42</span>
					</Tooltip>
				</div>,
			);

			fireEvent.click(screen.getByRole('button'));

			expect(onParentClick).not.toHaveBeenCalled();
		});
	});

	describe('additional props', () => {
		it('applies triggerClassName to the trigger', () => {
			render(
				<Tooltip content="Tip" focusable triggerClassName="my-trigger">
					<span>Trigger</span>
				</Tooltip>,
			);

			expect(screen.getByRole('button')).toHaveClass('tooltip__trigger', 'my-trigger');
		});

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
