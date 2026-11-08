import React from 'react';
import clsx from 'clsx';

/**
 * Eyebrow Atom - Atomic Design System
 *
 * The small uppercase label above a headline, or the "kind" line on a card.
 * Styling lives in src/view/style/atoms/_eyebrow.scss.
 */
export interface EyebrowProps {
	children: React.ReactNode;
	icon?: React.ReactNode;
	/** Ink instead of muted — for the one eyebrow that leads a hero. */
	accent?: boolean;
	/** currentColor — for eyebrows on a tone surface, where the card sets the ink. */
	inherit?: boolean;
	as?: 'span' | 'p' | 'div';
	className?: string;
	id?: string;
}

const Eyebrow: React.FC<EyebrowProps> = ({
	children,
	icon,
	accent = false,
	inherit = false,
	as: Tag = 'span',
	className,
	id,
}) => (
	<Tag
		id={id}
		className={clsx(
			'eyebrow',
			accent && 'eyebrow--accent',
			inherit && 'eyebrow--inherit',
			className,
		)}
	>
		{icon}
		{children}
	</Tag>
);

export default Eyebrow;
