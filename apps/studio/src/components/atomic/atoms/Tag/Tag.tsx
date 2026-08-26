import React from 'react';
import clsx from 'clsx';
import type { ActivityRunState } from '@freedi/event-core';

/**
 * Tag atom — TS wrapper over `.tag` (styles/atoms/_tag.scss).
 * Status / role / type variants are mutually exclusive `--*` modifiers.
 */

export type TagRole = 'owner' | 'admin' | 'viewer';
export type TagTypeModifier = 'mc' | 'join' | 'deliberation' | 'sign';
export type TagSize = 'small' | 'large';

export interface TagProps {
	/** Run-state variant (`.tag--status-*`). */
	status?: ActivityRunState;
	/** Member-role variant (`.tag--role-*`). */
	role?: TagRole;
	/** Activity-type variant (`.tag--type-*`). */
	type?: TagTypeModifier;
	/** Transparent background, 1px border in the current colour. */
	outline?: boolean;
	size?: TagSize;
	/** Leading text glyph, hidden from assistive tech (the label carries meaning). */
	glyph?: string;
	/** Leading colour dot (uses the variant's dot token). */
	dot?: boolean;
	/** Native title (tooltip). */
	title?: string;
	className?: string;
	children: React.ReactNode;
}

const Tag: React.FC<TagProps> = ({
	status,
	role,
	type,
	outline = false,
	size = 'small',
	glyph,
	dot = false,
	title,
	className,
	children,
}) => {
	const classes = clsx(
		'tag',
		status && `tag--status-${status}`,
		role && `tag--role-${role}`,
		type && `tag--type-${type}`,
		outline && 'tag--outline',
		size === 'large' && 'tag--large',
		className,
	);

	return (
		<span className={classes} title={title}>
			{dot && <span className="tag__dot" aria-hidden="true" />}
			{glyph && (
				<span className="tag__glyph" aria-hidden="true">
					{glyph}
				</span>
			)}
			<span className="tag__label">{children}</span>
		</span>
	);
};

export default Tag;
