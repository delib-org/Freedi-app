import React, { useState, useCallback, useRef, useEffect } from 'react';
import clsx from 'clsx';

/**
 * Input Atom - Atomic Design System
 *
 * A minimal React wrapper around BEM-styled input classes.
 * All styling is handled by SCSS in src/view/style/atoms/_input.scss
 *
 * Supports text input, textarea, and search variants via the `as` prop.
 */

// ============================================================================
// TYPES
// ============================================================================

export type InputSize = 'small' | 'medium' | 'large';
export type InputState = 'default' | 'error' | 'success' | 'disabled';
export type InputAs = 'input' | 'textarea';

export interface InputProps {
	/** Label text */
	label?: string;

	/** Placeholder text */
	placeholder?: string;

	/** Controlled value */
	value?: string;

	/** Default value for uncontrolled mode */
	defaultValue?: string;

	/** Change handler - receives the string value */
	onChange?: (value: string) => void;

	/** Blur handler */
	onBlur?: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void;

	/** Key down handler */
	onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;

	/** HTML input type */
	type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search';

	/** Render as input or textarea */
	as?: InputAs;

	/** Size variant */
	size?: InputSize;

	/** State variant */
	state?: InputState;

	/** Disabled state */
	disabled?: boolean;

	/** Read-only state */
	readOnly?: boolean;

	/** Required field */
	required?: boolean;

	/** Full width */
	fullWidth?: boolean;

	/** Auto focus */
	autoFocus?: boolean;

	/** Helper text displayed below the input */
	helperText?: string;

	/** Error text displayed below the input (overrides helperText) */
	errorText?: string;

	/** Maximum character count (shows counter) */
	maxLength?: number;

	/** Icon on the left side */
	iconLeft?: React.ReactNode;

	/** Icon on the right side */
	iconRight?: React.ReactNode;

	/** Show clear button when value is present */
	clearable?: boolean;

	/** Clear button icon (defaults to X) */
	clearIcon?: React.ReactNode;

	/** HTML name attribute */
	name?: string;

	/** Additional CSS classes */
	className?: string;

	/** HTML id attribute */
	id?: string;

	/** ARIA label for accessibility */
	ariaLabel?: string;

	/** Textarea rows (only when as="textarea") */
	rows?: number;
}

// ============================================================================
// COMPONENT
// ============================================================================

const Input: React.FC<InputProps> = ({
	label,
	placeholder,
	value: controlledValue,
	defaultValue = '',
	onChange,
	onBlur,
	onKeyDown,
	type = 'text',
	as = 'input',
	size = 'medium',
	state = 'default',
	disabled = false,
	readOnly = false,
	required = false,
	fullWidth = false,
	autoFocus = false,
	helperText,
	errorText,
	maxLength,
	iconLeft,
	iconRight,
	clearable = false,
	clearIcon,
	name,
	className,
	id,
	ariaLabel,
	rows = 3,
}) => {
	const isControlled = controlledValue !== undefined;
	const [internalValue, setInternalValue] = useState(defaultValue);
	const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

	const currentValue = isControlled ? controlledValue : internalValue;

	// Auto focus
	useEffect(() => {
		if (autoFocus && inputRef.current) {
			inputRef.current.focus();
		}
	}, [autoFocus]);

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
			const newValue = e.target.value;
			if (!isControlled) {
				setInternalValue(newValue);
			}
			onChange?.(newValue);
		},
		[isControlled, onChange],
	);

	const handleClear = useCallback(() => {
		if (!isControlled) {
			setInternalValue('');
		}
		onChange?.('');
		inputRef.current?.focus();
	}, [isControlled, onChange]);

	const inputId = id || `input-${name || 'field'}`;
	const effectiveState = disabled ? 'disabled' : state;
	const showError = effectiveState === 'error' && errorText;
	const showHelper = !showError && helperText;
	const showCharCount = maxLength !== undefined;

	// Build BEM classes for the wrapper
	const inputClasses = clsx(
		'input', // Block
		effectiveState !== 'default' && `input--${effectiveState}`, // Modifier: state
		size !== 'medium' && `input--${size}`, // Modifier: size
		fullWidth && 'input--full-width', // Modifier: full-width
		className, // Additional classes
	);

	// Shared field props
	const fieldProps = {
		ref: inputRef as React.Ref<HTMLInputElement> & React.Ref<HTMLTextAreaElement>,
		id: inputId,
		name,
		value: currentValue,
		onChange: handleChange,
		onBlur,
		onKeyDown,
		placeholder,
		disabled,
		readOnly,
		required,
		maxLength,
		'aria-label': ariaLabel || label,
		'aria-invalid': effectiveState === 'error',
		'aria-describedby': showError
			? `${inputId}-error`
			: showHelper
				? `${inputId}-helper`
				: undefined,
	};

	return (
		<div className={inputClasses}>
			{label && (
				<label htmlFor={inputId} className="input__label">
					{label}
					{required && <span aria-hidden="true"> *</span>}
				</label>
			)}

			<div className="input__container">
				{iconLeft && <span className="input__icon input__icon--left">{iconLeft}</span>}

				{as === 'textarea' ? (
					<textarea
						{...fieldProps}
						ref={inputRef as React.Ref<HTMLTextAreaElement>}
						className="input__field"
						rows={rows}
					/>
				) : (
					<input
						{...fieldProps}
						ref={inputRef as React.Ref<HTMLInputElement>}
						type={type}
						className="input__field"
					/>
				)}

				{clearable && currentValue && !disabled && !readOnly && (
					<button
						type="button"
						className="input__clear-button"
						onClick={handleClear}
						aria-label="Clear input"
						tabIndex={-1}
					>
						{clearIcon || (
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<line x1="18" y1="6" x2="6" y2="18" />
								<line x1="6" y1="6" x2="18" y2="18" />
							</svg>
						)}
					</button>
				)}

				{iconRight && <span className="input__icon input__icon--right">{iconRight}</span>}
			</div>

			{showError && (
				<span id={`${inputId}-error`} className="input__error-text" role="alert">
					{errorText}
				</span>
			)}

			{showHelper && (
				<span id={`${inputId}-helper`} className="input__helper-text">
					{helperText}
				</span>
			)}

			{showCharCount && (
				<span className="input__character-count">
					{currentValue.length}/{maxLength}
				</span>
			)}
		</div>
	);
};

export default Input;
