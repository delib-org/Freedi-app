import React from 'react';
import clsx from 'clsx';

/**
 * Toggle Atom - Atomic Design System
 *
 * A minimal React wrapper around BEM-styled toggle switch classes.
 * All styling is handled by SCSS in src/view/style/atoms/_toggle.scss
 */

// ============================================================================
// TYPES
// ============================================================================

export type ToggleSize = 'small' | 'medium' | 'large';
export type ToggleVariant = 'default' | 'success' | 'warning';

export interface ToggleProps {
	/** Current checked state */
	checked: boolean;

	/** Change handler */
	onChange: (checked: boolean) => void;

	/** Label text */
	label?: string;

	/** Hint text below the label */
	hint?: string;

	/** Size variant */
	size?: ToggleSize;

	/** Color variant */
	variant?: ToggleVariant;

	/** Disabled state */
	disabled?: boolean;

	/** Additional CSS classes */
	className?: string;

	/** HTML id attribute */
	id?: string;

	/** ARIA label for accessibility */
	ariaLabel?: string;

	/** Name attribute for forms */
	name?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

const Toggle: React.FC<ToggleProps> = ({
	checked,
	onChange,
	label,
	hint,
	size = 'medium',
	variant = 'default',
	disabled = false,
	className,
	id,
	ariaLabel,
	name,
}) => {
	// Build BEM classes
	const toggleClasses = clsx(
		'toggle', // Block
		size !== 'medium' && `toggle--${size}`, // Modifier: size
		variant !== 'default' && `toggle--${variant}`, // Modifier: variant
		disabled && 'toggle--disabled', // Modifier: disabled
		className, // Additional classes
	);

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (!disabled) {
			onChange(e.target.checked);
		}
	};

	return (
		<label className={toggleClasses}>
			<input
				type="checkbox"
				id={id}
				name={name}
				checked={checked}
				onChange={handleChange}
				disabled={disabled}
				aria-label={ariaLabel || label}
			/>
			<span className="toggle__track">
				<span className="toggle__thumb" />
			</span>
			{(label || hint) && (
				<span className="toggle__content">
					{label && <span className="toggle__label">{label}</span>}
					{hint && <span className="toggle__hint">{hint}</span>}
				</span>
			)}
		</label>
	);
};

export default Toggle;
