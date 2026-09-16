import type { CSSProperties } from 'react';

interface Props {
	name: string;
	color: string;
	/** This ship's card is open — the badge goes gold wherever it appears. */
	lit?: boolean;
	/** The pointer is on this ship's hull or badge somewhere else on the page. */
	hot?: boolean;
	/** Another ship is picked; this one steps back a little. */
	dim?: boolean;
	/** Given, the badge is a button; without it, a plain label. */
	onSelect?: () => void;
	onHover?: (hovering: boolean) => void;
	/** The spoken name: name plus how near, for a screen reader. */
	ariaLabel?: string;
	/** The ship this badge belongs to, stamped on the element so the hull on
	 *  the water and its pennant can be told apart from a neighbour's. */
	partyId?: string;
	className?: string;
	/** Placement on the water is computed at render time, so it is data, not styling. */
	style?: CSSProperties;
}

/**
 * A ship's pennant: its colour and its name, one badge.
 *
 * The same badge rides above the hull on the water, sits in the near / middle
 * / far rows under the sea, and heads the card a tap opens — so a party looks
 * the same in all three places, and the one you picked goes gold in all three
 * at once. The sea, the rows and the card stop being three lists of the same
 * parties and become one instrument read three ways.
 */
export default function ShipTag({
	name,
	color,
	lit = false,
	hot = false,
	dim = false,
	onSelect,
	onHover,
	ariaLabel,
	partyId,
	className,
	style,
}: Props) {
	const classes = [
		'ship-tag',
		lit ? 'ship-tag--lit' : '',
		hot ? 'ship-tag--hot' : '',
		dim ? 'ship-tag--dim' : '',
		className ?? '',
	]
		.filter(Boolean)
		.join(' ');
	const dot = <span className="ship-tag__dot" style={{ background: color }} aria-hidden="true" />;

	if (!onSelect) {
		return (
			<span className={classes} style={style} data-party={partyId}>
				{dot}
				<span className="ship-tag__name">{name}</span>
			</span>
		);
	}

	return (
		<button
			type="button"
			className={classes}
			style={style}
			data-party={partyId}
			onClick={onSelect}
			onPointerEnter={onHover ? () => onHover(true) : undefined}
			onPointerLeave={onHover ? () => onHover(false) : undefined}
			onFocus={onHover ? () => onHover(true) : undefined}
			onBlur={onHover ? () => onHover(false) : undefined}
			aria-pressed={lit}
			aria-label={ariaLabel}
		>
			{dot}
			<span className="ship-tag__name">{name}</span>
		</button>
	);
}
