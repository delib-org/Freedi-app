import React from 'react';
import clsx from 'clsx';

/**
 * EmptyState atom — centred placeholder for empty lists, errors, no results.
 * Styles: styles/atoms/_empty-state.scss
 */

export type EmptyStateVariant = 'default' | 'error' | 'search';

export interface EmptyStateProps {
	/** Emoji or icon node. */
	icon?: React.ReactNode;
	title: string;
	text?: string;
	/** Primary action (usually a <Button>). */
	action?: React.ReactNode;
	/** Secondary line under the action (link, hint…). */
	secondary?: React.ReactNode;
	variant?: EmptyStateVariant;
	compact?: boolean;
	className?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({
	icon,
	title,
	text,
	action,
	secondary,
	variant = 'default',
	compact = false,
	className,
}) => {
	const classes = clsx(
		'empty-state',
		variant !== 'default' && `empty-state--${variant}`,
		compact && 'empty-state--compact',
		className,
	);

	return (
		<div className={classes} role={variant === 'error' ? 'alert' : undefined}>
			{icon && (
				<div className="empty-state__icon" aria-hidden="true">
					{icon}
				</div>
			)}
			<h3 className="empty-state__title">{title}</h3>
			{text && <p className="empty-state__text">{text}</p>}
			{action && <div className="empty-state__action">{action}</div>}
			{secondary && <div className="empty-state__secondary">{secondary}</div>}
		</div>
	);
};

export default EmptyState;
