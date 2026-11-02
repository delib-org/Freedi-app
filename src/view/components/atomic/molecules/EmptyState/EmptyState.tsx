import React from 'react';
import clsx from 'clsx';

/**
 * EmptyState Molecule - Atomic Design System
 *
 * What a list says when it has nothing: a muted icon, one sentence, an
 * optional hint and at most one action. No illustrations.
 * Styling lives in src/view/style/molecules/_empty-state.scss.
 */
export interface EmptyStateProps {
	text: string;
	/** A lucide icon; it is decorative. */
	icon?: React.ReactNode;
	hint?: string;
	action?: React.ReactNode;
	compact?: boolean;
	className?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({
	text,
	icon,
	hint,
	action,
	compact = false,
	className,
}) => (
	<div className={clsx('empty-state', compact && 'empty-state--compact', className)}>
		{icon && (
			<span className="empty-state__icon" aria-hidden="true">
				{icon}
			</span>
		)}
		<p className="empty-state__text">{text}</p>
		{hint && <p className="empty-state__hint">{hint}</p>}
		{action}
	</div>
);

export default EmptyState;
