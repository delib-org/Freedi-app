import React, { useState, useRef, useEffect, useCallback } from 'react';
import clsx from 'clsx';

/**
 * Tooltip Atom - Atomic Design System
 *
 * A minimal React wrapper around BEM-styled tooltip classes.
 * All styling is handled by SCSS in src/view/style/atoms/_tooltip.scss
 *
 * Shows on hover (desktop) or tap (mobile). Dismisses on outside click (mobile).
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

	/** HTML id attribute */
	id?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MOBILE_BREAKPOINT = 768;

// ============================================================================
// COMPONENT
// ============================================================================

const Tooltip: React.FC<TooltipProps> = ({
	content,
	children,
	position = 'top',
	variant = 'dark',
	className,
	id,
}) => {
	const [isVisible, setIsVisible] = useState(false);
	const [isMobile, setIsMobile] = useState(false);
	const triggerRef = useRef<HTMLDivElement>(null);

	// Detect mobile vs desktop
	useEffect(() => {
		const checkMobile = () => {
			setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
		};

		checkMobile();
		window.addEventListener('resize', checkMobile);

		return () => {
			window.removeEventListener('resize', checkMobile);
		};
	}, []);

	// Handle outside click to dismiss on mobile
	useEffect(() => {
		if (!isMobile || !isVisible) return;

		const handleClickOutside = (event: MouseEvent) => {
			if (triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
				setIsVisible(false);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);

		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [isMobile, isVisible]);

	const handleToggle = useCallback(() => {
		if (isMobile) {
			setIsVisible((prev) => !prev);
		}
	}, [isMobile]);

	const handleMouseEnter = useCallback(() => {
		if (!isMobile) {
			setIsVisible(true);
		}
	}, [isMobile]);

	const handleMouseLeave = useCallback(() => {
		if (!isMobile) {
			setIsVisible(false);
		}
	}, [isMobile]);

	// Build BEM classes
	const tooltipClasses = clsx(
		'tooltip', // Block
		`tooltip--${position}`, // Modifier: position
		variant !== 'dark' && `tooltip--${variant}`, // Modifier: variant
		className, // Additional classes
	);

	return (
		<div
			id={id}
			className={tooltipClasses}
			ref={triggerRef}
			onClick={handleToggle}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
		>
			<div className="tooltip__trigger">{children}</div>
			{isVisible && (
				<div className="tooltip__content" role="tooltip">
					{content}
					<span className="tooltip__arrow" aria-hidden="true" />
				</div>
			)}
		</div>
	);
};

export default Tooltip;
