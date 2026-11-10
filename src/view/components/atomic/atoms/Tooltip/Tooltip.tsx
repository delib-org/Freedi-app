import React, {
	useState,
	useRef,
	useEffect,
	useLayoutEffect,
	useCallback,
	useId,
	CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { resolvePlacement, viewportShift } from './tooltipPlacement';

/**
 * Tooltip Atom - Atomic Design System
 *
 * A minimal React wrapper around BEM-styled tooltip classes.
 * All styling is handled by SCSS in src/view/style/atoms/_tooltip.scss
 *
 * Opens on mouse hover, on tap and on keyboard focus. What opened it decides,
 * not the width of the screen, so a wide touch screen works as well. Closes on
 * mouse leave, a second tap, a tap elsewhere, blur or Escape.
 *
 * The bubble is drawn in a portal: answer cards clip their content
 * (`overflow-x: hidden`) and a bubble inside them would be cut off.
 */

// ============================================================================
// TYPES
// ============================================================================

export type TooltipPosition =
	| 'top'
	| 'bottom'
	| 'left'
	| 'right'
	| 'top-left'
	| 'top-right'
	| 'bottom-left'
	| 'bottom-right';

export type TooltipVariant = 'dark' | 'light';

export interface TooltipProps {
	/** Tooltip text content */
	content: string;

	/** Trigger element */
	children: React.ReactNode;

	/** Position of the tooltip relative to the trigger */
	position?: TooltipPosition;

	/** Visual variant */
	variant?: TooltipVariant;

	/** Additional CSS classes */
	className?: string;

	/** Additional CSS classes for the trigger */
	triggerClassName?: string;

	/** HTML id attribute */
	id?: string;

	/**
	 * Render the trigger as a real button, for content that is not a control
	 * itself (a number, a label), so that it can be tapped and reached by
	 * keyboard. Leave off when `children` is already a control.
	 */
	focusable?: boolean;
}

interface AnchorRect {
	left: number;
	top: number;
	width: number;
	height: number;
}

type PointerKind = 'mouse' | 'touch';

function pointerKindOf(pointerType: string): PointerKind {
	return pointerType === 'touch' || pointerType === 'pen' ? 'touch' : 'mouse';
}

// ============================================================================
// COMPONENT
// ============================================================================

const Tooltip: React.FC<TooltipProps> = ({
	content,
	children,
	position = 'top',
	variant = 'dark',
	className,
	triggerClassName,
	id,
	focusable = false,
}) => {
	const [isVisible, setIsVisible] = useState(false);
	const [anchor, setAnchor] = useState<AnchorRect | null>(null);
	const [placement, setPlacement] = useState<TooltipPosition>(position);
	const [shift, setShift] = useState(0);
	const rootRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const contentId = useId();
	// A tap also fires the browser's emulated mouse events and a focus event.
	// These two refs keep those from opening and at once closing the tooltip.
	const lastPointerRef = useRef<PointerKind | null>(null);
	const isPressingRef = useRef(false);

	const measureAnchor = useCallback(() => {
		if (!rootRef.current) return;
		const { left, top, width, height } = rootRef.current.getBoundingClientRect();
		setAnchor({ left, top, width, height });
	}, []);

	useLayoutEffect(() => {
		if (isVisible) measureAnchor();
	}, [isVisible, measureAnchor]);

	useLayoutEffect(() => {
		if (!isVisible || !anchor || !contentRef.current) return;
		const box = contentRef.current.getBoundingClientRect();
		const { clientWidth, clientHeight } = document.documentElement;
		setPlacement(
			resolvePlacement(
				position,
				{ top: anchor.top, bottom: anchor.top + anchor.height },
				box.height,
				clientHeight,
			),
		);
		// The box already includes the current shift; measure from where it started.
		setShift((current) => viewportShift(box.left - current, box.right - current, clientWidth));
	}, [isVisible, anchor, position]);

	// The bubble is fixed to the screen, so it follows the trigger when the page moves.
	useEffect(() => {
		if (!isVisible) return;

		window.addEventListener('scroll', measureAnchor, { capture: true, passive: true });
		window.addEventListener('resize', measureAnchor);

		return () => {
			window.removeEventListener('scroll', measureAnchor, { capture: true });
			window.removeEventListener('resize', measureAnchor);
		};
	}, [isVisible, measureAnchor]);

	// A tap or click anywhere else closes it.
	useEffect(() => {
		if (!isVisible) return;

		const handleOutsidePress = (event: PointerEvent) => {
			if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
				setIsVisible(false);
			}
		};

		document.addEventListener('pointerdown', handleOutsidePress);

		return () => {
			document.removeEventListener('pointerdown', handleOutsidePress);
		};
	}, [isVisible]);

	// On the document, because a tooltip opened by hover has no focus to receive
	// the key (WCAG 1.4.13). Capturing it keeps Escape from also closing a modal.
	useEffect(() => {
		if (!isVisible) return;

		const handleEscape = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			event.stopPropagation();
			setIsVisible(false);
		};

		document.addEventListener('keydown', handleEscape, { capture: true });

		return () => {
			document.removeEventListener('keydown', handleEscape, { capture: true });
		};
	}, [isVisible]);

	const handlePointerEnter = (event: React.PointerEvent) => {
		lastPointerRef.current = pointerKindOf(event.pointerType);
	};

	const handlePointerDown = (event: React.PointerEvent) => {
		lastPointerRef.current = pointerKindOf(event.pointerType);
		isPressingRef.current = true;
	};

	const handleMouseEnter = () => {
		if (lastPointerRef.current !== 'touch') setIsVisible(true);
	};

	const handleMouseLeave = () => {
		if (lastPointerRef.current !== 'touch') setIsVisible(false);
	};

	const handleClick = (event: React.MouseEvent) => {
		// A trigger inside a clickable card must not also open the card.
		if (focusable) event.stopPropagation();
		isPressingRef.current = false;
		// With a mouse, hover already decides. `detail` is 0 for Enter and Space.
		const isMouseClick = lastPointerRef.current === 'mouse' && event.detail > 0;
		if (!isMouseClick) setIsVisible((previous) => !previous);
	};

	const handleFocus = () => {
		if (!isPressingRef.current) setIsVisible(true);
	};

	const handleBlur = () => {
		isPressingRef.current = false;
		setIsVisible(false);
	};

	// Build BEM classes
	const tooltipClasses = clsx(
		'tooltip', // Block
		`tooltip--${position}`, // Modifier: position
		variant !== 'dark' && `tooltip--${variant}`, // Modifier: variant
		className, // Additional classes
	);
	const anchorClasses = clsx(
		'tooltip',
		'tooltip--anchor',
		`tooltip--${placement}`,
		variant !== 'dark' && `tooltip--${variant}`,
	);
	const triggerClasses = clsx(
		'tooltip__trigger',
		focusable && 'tooltip__trigger--button',
		triggerClassName,
	);
	const anchorStyle = {
		'--tooltip-left': `${anchor?.left ?? 0}px`,
		'--tooltip-top': `${anchor?.top ?? 0}px`,
		'--tooltip-width': `${anchor?.width ?? 0}px`,
		'--tooltip-height': `${anchor?.height ?? 0}px`,
		'--tooltip-shift': `${shift}px`,
	} as CSSProperties;

	return (
		<div
			id={id}
			className={tooltipClasses}
			ref={rootRef}
			onClick={handleClick}
			onPointerEnter={handlePointerEnter}
			onPointerDown={handlePointerDown}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
			onFocus={handleFocus}
			onBlur={handleBlur}
		>
			{focusable ? (
				<button
					type="button"
					className={triggerClasses}
					aria-describedby={isVisible ? contentId : undefined}
				>
					{children}
				</button>
			) : (
				<div className={triggerClasses}>{children}</div>
			)}
			{isVisible &&
				createPortal(
					<div className={anchorClasses} style={anchorStyle}>
						<div
							ref={contentRef}
							id={contentId}
							className="tooltip__content"
							role="tooltip"
							dir="auto"
						>
							{content}
							<span className="tooltip__arrow" aria-hidden="true" />
						</div>
					</div>,
					document.body,
				)}
		</div>
	);
};

export default Tooltip;
