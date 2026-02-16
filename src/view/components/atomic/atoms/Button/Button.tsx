import React from 'react';
import clsx from 'clsx';

/**
 * Button Atom - Atomic Design System
 *
 * A minimal React wrapper around BEM-styled button classes.
 * All styling is handled by SCSS in src/view/style/atoms/_button.scss
 */

// ============================================================================
// TYPES
// ============================================================================

export type ButtonVariant =
	| 'primary'
	| 'secondary'
	| 'agree'
	| 'disagree'
	| 'approve'
	| 'reject'
	| 'add'
	| 'cancel'
	| 'inactive'
	| 'icon'
	| 'affirmation'
	| 'outline-white'
	| 'outline-gray';

export type ButtonSize = 'small' | 'medium' | 'large' | 'mass-consensus';

export interface ButtonProps {
	/** Button text content */
	text: string;

	/** Visual variant of the button */
	variant?: ButtonVariant;

	/** Size of the button */
	size?: ButtonSize;

	/** HTML button type */
	type?: 'button' | 'submit' | 'reset';

	/** Disabled state */
	disabled?: boolean;

	/** Loading state */
	loading?: boolean;

	/** Full width button */
	fullWidth?: boolean;

	/** Icon to display */
	icon?: React.ReactNode;

	/** Show image in button */
	image?: string;

	/** Click handler */
	onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;

	/** Additional CSS classes */
	className?: string;

	/** ARIA label for accessibility */
	ariaLabel?: string;

	/** HTML id attribute */
	id?: string;

	/** Tab index */
	tabIndex?: number;
}

// ============================================================================
// COMPONENT
// ============================================================================

const Button: React.FC<ButtonProps> = ({
	text,
	variant = 'primary',
	size = 'medium',
	type = 'button',
	disabled = false,
	loading = false,
	fullWidth = false,
	icon,
	image,
	onClick,
	className,
	ariaLabel,
	id,
	tabIndex,
}) => {
	// Build BEM classes
	const buttonClasses = clsx(
		'button', // Block
		`button--${variant}`, // Modifier: variant
		size !== 'medium' && `button--${size}`, // Modifier: size (if not default)
		fullWidth && 'button--full-width', // Modifier: full-width
		loading && 'button--loading', // Modifier: loading
		disabled && 'button--disabled', // Modifier: disabled
		image && 'button--with-image', // Modifier: with-image
		className, // Additional classes
	);

	const isDisabled = disabled || loading;

	return (
		<button
			id={id}
			type={type}
			className={buttonClasses}
			onClick={!isDisabled ? onClick : undefined}
			disabled={isDisabled}
			aria-label={ariaLabel || text}
			aria-busy={loading}
			tabIndex={tabIndex}
		>
			{loading && <span className="button__loader" aria-hidden="true" />}

			{icon && <span className="button__icon">{icon}</span>}

			{image && <img src={image} alt="" />}

			<span className="button__text">{text}</span>
		</button>
	);
};

export default Button;
