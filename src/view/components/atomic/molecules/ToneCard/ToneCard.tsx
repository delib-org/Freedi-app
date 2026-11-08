import React, { ElementType } from 'react';
import clsx from 'clsx';

/**
 * ToneCard Molecule - Atomic Design System
 *
 * A card that wears one of the pastel tones as its surface. Styling lives in
 * src/view/style/molecules/_tone-card.scss; the tone brings its own ink, so
 * children need no colour rules of their own.
 */
export type CardTone = 'surface' | 'lilac' | 'mint' | 'yellow' | 'pink' | 'peach';

/** The tones a list cycles through, in the order the design lays them out. */
export const TONE_CYCLE: readonly CardTone[] = ['lilac', 'yellow', 'mint', 'peach'] as const;

/** The tone for the n-th card in a list. */
export function toneFor(index: number): CardTone {
	return TONE_CYCLE[((index % TONE_CYCLE.length) + TONE_CYCLE.length) % TONE_CYCLE.length];
}

export interface ToneCardProps extends Omit<React.HTMLAttributes<HTMLElement>, 'className'> {
	tone?: CardTone;
	compact?: boolean;
	/** Lifts on hover. Set automatically for `a`, `button` and router links. */
	interactive?: boolean;
	/** The element or component to render — `'section'`, `'li'`, `'a'`, `'button'`, or a `Link`. */
	as?: ElementType;
	className?: string;
	children: React.ReactNode;
	href?: string;
	type?: 'button' | 'submit';
	/** Passed through to a router `Link`. */
	to?: string;
	state?: unknown;
}

const ToneCard: React.FC<ToneCardProps> = ({
	tone = 'surface',
	compact = false,
	interactive,
	as: Tag = 'div',
	className,
	children,
	...rest
}) => {
	const isInteractive = interactive ?? (Tag === 'a' || Tag === 'button' || typeof Tag !== 'string');
	const classes = clsx(
		'tone-card',
		tone !== 'surface' && `tone-card--${tone}`,
		compact && 'tone-card--compact',
		isInteractive && 'tone-card--interactive',
		className,
	);

	return (
		<Tag className={classes} data-tone={tone} {...rest}>
			{children}
		</Tag>
	);
};

export default ToneCard;
