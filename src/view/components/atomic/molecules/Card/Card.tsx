import React from 'react';
import clsx from 'clsx';

/**
 * Card Molecule - Atomic Design System
 *
 * A flexible card container component.
 * All styling is handled by SCSS in src/view/style/molecules/_card.scss
 */

// ============================================================================
// TYPES
// ============================================================================

export type CardVariant =
	| 'default'
	| 'question'
	| 'suggestion'
	| 'message'
	| 'error'
	| 'success'
	| 'warning'
	| 'info';

export type CardShadow = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps {
	/** Card title */
	title?: string;

	/** Card subtitle */
	subtitle?: string;

	/** Card body content */
	children: React.ReactNode;

	/** Header actions (buttons, etc.) */
	headerActions?: React.ReactNode;

	/** Footer content (usually buttons) */
	footer?: React.ReactNode;

	/** Media content (images, videos) */
	media?: React.ReactNode;

	/** Badge content */
	badge?: React.ReactNode;

	/** Visual variant */
	variant?: CardVariant;

	/** Elevated shadow */
	elevated?: boolean;

	/** Interactive (clickable) */
	interactive?: boolean;

	/** Selected state */
	selected?: boolean;

	/** Disabled state */
	disabled?: boolean;

	/** Loading state */
	loading?: boolean;

	/** Compact padding */
	compact?: boolean;

	/** Spacious padding */
	spacious?: boolean;

	/** Bordered style */
	bordered?: boolean;

	/** Flat style (no shadow) */
	flat?: boolean;

	/** Shadow level */
	shadow?: CardShadow;

	/** Horizontal layout */
	horizontal?: boolean;

	/** Full width */
	fullWidth?: boolean;

	/** Centered content */
	centered?: boolean;

	/** Click handler (if interactive) */
	onClick?: () => void;

	/** Additional CSS classes */
	className?: string;

	/** HTML id attribute */
	id?: string;

	/** Tab index (if interactive) */
	tabIndex?: number;
}

// ============================================================================
// COMPONENT
// ============================================================================

const Card: React.FC<CardProps> = ({
	title,
	subtitle,
	children,
	headerActions,
	footer,
	media,
	badge,
	variant = 'default',
	elevated = false,
	interactive = false,
	selected = false,
	disabled = false,
	loading = false,
	compact = false,
	spacious = false,
	bordered = false,
	flat = false,
	shadow,
	horizontal = false,
	fullWidth = false,
	centered = false,
	onClick,
	className,
	id,
	tabIndex,
}) => {
	// Build BEM classes
	const cardClasses = clsx(
		'card', // Block
		variant !== 'default' && `card--${variant}`, // Modifier: variant
		elevated && 'card--elevated', // Modifier: elevated
		interactive && 'card--interactive', // Modifier: interactive
		selected && 'card--selected', // Modifier: selected
		disabled && 'card--disabled', // Modifier: disabled
		loading && 'card--loading', // Modifier: loading
		compact && 'card--compact', // Modifier: compact
		spacious && 'card--spacious', // Modifier: spacious
		bordered && 'card--bordered', // Modifier: bordered
		flat && 'card--flat', // Modifier: flat
		shadow && `card--shadow-${shadow}`, // Modifier: shadow level
		horizontal && 'card--horizontal', // Modifier: horizontal
		fullWidth && 'card--full-width', // Modifier: full-width
		centered && 'card--centered', // Modifier: centered
		className, // Additional classes
	);

	const handleClick = (): void => {
		if (interactive && onClick && !disabled && !loading) {
			onClick();
		}
	};

	const handleKeyPress = (event: React.KeyboardEvent<HTMLDivElement>): void => {
		if (interactive && onClick && !disabled && !loading) {
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				onClick();
			}
		}
	};

	return (
		<div
			id={id}
			className={cardClasses}
			onClick={handleClick}
			onKeyPress={handleKeyPress}
			role={interactive ? 'button' : undefined}
			tabIndex={interactive ? tabIndex || 0 : undefined}
			aria-disabled={disabled}
			aria-busy={loading}
		>
			{badge && <div className="card__badge">{badge}</div>}

			{media && <div className="card__media">{media}</div>}

			{(title || subtitle || headerActions) && (
				<div className="card__header">
					<div>
						{title && <h3 className="card__title">{title}</h3>}
						{subtitle && <p className="card__subtitle">{subtitle}</p>}
					</div>
					{headerActions && <div className="card__actions">{headerActions}</div>}
				</div>
			)}

			<div className="card__body">{children}</div>

			{footer && <div className="card__footer">{footer}</div>}
		</div>
	);
};

export default Card;
