import React from 'react';
import clsx from 'clsx';

/**
 * FAB (Floating Action Button) - Atomic Design System
 *
 * A circular floating action button for primary actions.
 * All styling is handled by SCSS in src/view/style/atoms/_button.scss
 */

// ============================================================================
// TYPES
// ============================================================================

export interface FABProps {
	/** Icon or content to display */
	children: React.ReactNode;

	/** Click handler */
	onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;

	/** Blink animation */
	blink?: boolean;

	/** Fixed positioning */
	fixed?: boolean;

	/** Position at up location */
	up?: boolean;

	/** Additional CSS classes */
	className?: string;

	/** ARIA label for accessibility */
	ariaLabel: string;

	/** HTML id attribute */
	id?: string;

	/** Tab index */
	tabIndex?: number;
}

// ============================================================================
// COMPONENT
// ============================================================================

const FAB: React.FC<FABProps> = ({
	children,
	onClick,
	blink = false,
	fixed = false,
	up = false,
	className,
	ariaLabel,
	id,
	tabIndex,
}) => {
	// Build BEM classes
	const fabClasses = clsx(
		'fab', // Block
		blink && 'fab--blink', // Modifier: blink
		fixed && 'fab--fixed', // Modifier: fixed
		up && 'fab--up', // Modifier: up
		className, // Additional classes
	);

	return (
		<button
			id={id}
			type="button"
			className={fabClasses}
			onClick={onClick}
			aria-label={ariaLabel}
			tabIndex={tabIndex}
		>
			<div className="fab__inner">{children}</div>
		</button>
	);
};

export default FAB;
