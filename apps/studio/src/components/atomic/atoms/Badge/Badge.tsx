import React from 'react';
import clsx from 'clsx';

/**
 * Badge atom — thin wrapper over the shared `.badge` block
 * (@freedi/shared-styles/atoms/_badge.scss): counters and small status dots.
 */

export type BadgeVariant = 'notification' | 'unread' | 'success' | 'warning' | 'info' | 'neutral';
export type BadgeSize = 'small' | 'medium' | 'large';
export type BadgePosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

export interface BadgeProps {
	variant?: BadgeVariant;
	size?: BadgeSize;
	/** Absolute-position inside a `.badge-container`. */
	position?: BadgePosition;
	/** Render as a bare dot (no content). */
	dot?: boolean;
	pill?: boolean;
	square?: boolean;
	pulse?: boolean;
	/** Accessible name when the visual content is not self-explanatory. */
	ariaLabel?: string;
	className?: string;
	children?: React.ReactNode;
}

const Badge: React.FC<BadgeProps> = ({
	variant,
	size = 'medium',
	position,
	dot = false,
	pill = false,
	square = false,
	pulse = false,
	ariaLabel,
	className,
	children,
}) => {
	const classes = clsx(
		'badge',
		variant && `badge--${variant}`,
		size !== 'medium' && `badge--${size}`,
		position && `badge--${position}`,
		dot && 'badge--dot',
		pill && 'badge--pill',
		square && 'badge--square',
		pulse && 'badge--pulse',
		className,
	);

	return (
		<span
			className={classes}
			aria-label={ariaLabel}
			aria-hidden={dot && !ariaLabel ? true : undefined}
		>
			{!dot && children}
		</span>
	);
};

export default Badge;
