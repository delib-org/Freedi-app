import React, { useCallback } from 'react';
import clsx from 'clsx';

/**
 * Checkbox Atom - Atomic Design System
 *
 * A minimal React wrapper around BEM-styled checkbox classes.
 * All styling is handled by SCSS in src/view/style/atoms/_checkbox.scss
 *
 * Supports both custom icon mode (pass icon/checkedIcon) and native box mode.
 */

// ============================================================================
// TYPES
// ============================================================================

export type CheckboxSize = 'small' | 'medium' | 'large';

export interface CheckboxProps {
	/** Label text for the checkbox */
	label: string;

	/** Whether the checkbox is checked */
	checked: boolean;

	/** Change handler */
	onChange: (checked: boolean) => void;

	/** Size variant */
	size?: CheckboxSize;

	/** Disabled state */
	disabled?: boolean;

	/** Error state */
	error?: boolean;

	/** Indeterminate state (for parent checkboxes) */
	indeterminate?: boolean;

	/** Optional hint text below the label */
	hint?: string;

	/** Custom unchecked icon */
	icon?: React.ReactNode;

	/** Custom checked icon */
	checkedIcon?: React.ReactNode;

	/** HTML name attribute for forms */
	name?: string;

	/** Additional CSS classes */
	className?: string;

	/** HTML id attribute */
	id?: string;

	/** ARIA label override */
	ariaLabel?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

const Checkbox: React.FC<CheckboxProps> = ({
	label,
	checked,
	onChange,
	size = 'medium',
	disabled = false,
	error = false,
	indeterminate = false,
	hint,
	icon,
	checkedIcon,
	name,
	className,
	id,
	ariaLabel,
}) => {
	const handleChange = useCallback(() => {
		if (!disabled) {
			onChange(!checked);
		}
	}, [disabled, checked, onChange]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLLabelElement>) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				handleChange();
			}
		},
		[handleChange],
	);

	const inputId = id || `checkbox-${name || label}`;
	const hasCustomIcons = icon !== undefined && checkedIcon !== undefined;

	// Build BEM classes
	const checkboxClasses = clsx(
		'checkbox', // Block
		checked && 'checkbox--checked', // Modifier: checked
		indeterminate && !checked && 'checkbox--indeterminate', // Modifier: indeterminate
		disabled && 'checkbox--disabled', // Modifier: disabled
		error && 'checkbox--error', // Modifier: error
		size !== 'medium' && `checkbox--${size}`, // Modifier: size
		className, // Additional classes
	);

	return (
		<label
			className={checkboxClasses}
			htmlFor={inputId}
			onKeyDown={handleKeyDown}
			tabIndex={0}
			role="checkbox"
			aria-checked={indeterminate ? 'mixed' : checked}
			aria-label={ariaLabel || label}
		>
			<input
				type="checkbox"
				id={inputId}
				name={name}
				checked={checked}
				onChange={handleChange}
				disabled={disabled}
				className="checkbox__input"
				tabIndex={-1}
				aria-hidden="true"
			/>

			{hasCustomIcons ? (
				<span className="checkbox__icon" aria-hidden="true">
					{checked ? checkedIcon : icon}
				</span>
			) : (
				<span className="checkbox__box" aria-hidden="true">
					{checked && (
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
							<polyline points="20 6 9 17 4 12" />
						</svg>
					)}
					{indeterminate && !checked && (
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
							<line x1="5" y1="12" x2="19" y2="12" />
						</svg>
					)}
				</span>
			)}

			<span className="checkbox__label">
				{label}
				{hint && <span className="checkbox__hint">{hint}</span>}
			</span>
		</label>
	);
};

export default Checkbox;
