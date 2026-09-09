import React from 'react';
import clsx from 'clsx';

/**
 * Chip Atom - Atomic Design System
 *
 * The one chip style: sort chips, "12 here", deadline, type accents.
 * Styling lives in src/view/style/molecules/_chip.scss. Renders a <button>
 * when it has an onClick (aria-pressed reflects `selected`), a <span> otherwise.
 */

type AccentStyle = React.CSSProperties & Record<'--chip-accent', string>;

export interface ChipProps {
	label: string;
	count?: number;
	icon?: React.ReactNode;
	selected?: boolean;
	muted?: boolean;
	/** Any CSS colour; rendered as a leading dot. Token injection is the one allowed inline style. */
	accentColor?: string;
	onClick?: () => void;
	disabled?: boolean;
	className?: string;
	id?: string;
	ariaLabel?: string;
}

const Chip: React.FC<ChipProps> = ({
	label,
	count,
	icon,
	selected = false,
	muted = false,
	accentColor,
	onClick,
	disabled = false,
	className,
	id,
	ariaLabel,
}) => {
	const interactive = typeof onClick === 'function';
	const classes = clsx(
		'chip',
		interactive && 'chip--interactive',
		selected && 'chip--selected',
		muted && 'chip--muted',
		accentColor && 'chip--accent',
		className,
	);
	const style: AccentStyle | undefined = accentColor ? { '--chip-accent': accentColor } : undefined;

	const content = (
		<>
			{icon && <span className="chip__icon">{icon}</span>}
			<span className="chip__label">{label}</span>
			{typeof count === 'number' && <span className="chip__count">{count}</span>}
		</>
	);

	if (interactive) {
		return (
			<button
				type="button"
				id={id}
				className={classes}
				style={style}
				onClick={onClick}
				disabled={disabled}
				aria-pressed={selected}
				aria-label={ariaLabel}
			>
				{content}
			</button>
		);
	}

	return (
		<span id={id} className={classes} style={style} aria-label={ariaLabel}>
			{content}
		</span>
	);
};

export default Chip;
