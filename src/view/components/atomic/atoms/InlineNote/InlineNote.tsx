import React from 'react';
import clsx from 'clsx';

/**
 * InlineNote Atom - Atomic Design System
 *
 * A one-line message tied to the control above it. Errors are announced at
 * once (`role="alert"`); success and info wait their turn (`role="status"`).
 * Styling lives in src/view/style/atoms/_inline-note.scss.
 */
export type InlineNoteVariant = 'error' | 'success' | 'info';

export interface InlineNoteProps {
	variant: InlineNoteVariant;
	children: React.ReactNode;
	/** Optional control at inline-end, e.g. a Retry button. */
	action?: React.ReactNode;
	className?: string;
	id?: string;
}

const InlineNote: React.FC<InlineNoteProps> = ({ variant, children, action, className, id }) => (
	<p
		id={id}
		className={clsx('inline-note', `inline-note--${variant}`, className)}
		role={variant === 'error' ? 'alert' : 'status'}
	>
		<span className="inline-note__text">{children}</span>
		{action && <span className="inline-note__action">{action}</span>}
	</p>
);

export default InlineNote;
