import m from 'mithril';

export interface StandingBarAttrs {
	/** "For" / "Against" — the side this column counts */
	label: string;
	count: number;
	/** 0–100, of all votes cast */
	share: number;
	/** Whether the tally may be shown; hidden, the column is an empty track */
	showCount: boolean;
}

/**
 * The inside of one standing column of a for/against vote: the count on top,
 * the upright track with its fill rising from the floor, the side's name
 * under it. The caller supplies the frame — a button on the ballot, a plain
 * block on the recap — and the `voting__option--for/--against` tone.
 *
 * A motion is two answers to one question, not a ranking, so its tally
 * stands side by side as two pillars the room can compare at a glance, where
 * a list of rows would read as "first place and second place".
 */
export function standingBar({ label, count, share, showCount }: StandingBarAttrs): m.Children {
	return [
		showCount
			? m('span.voting__count.voting__count--standing', [
					m('span.voting__votes', String(count)),
					m('span.voting__share', `${share}%`),
				])
			: null,
		m(
			'span.voting__track',
			{ 'aria-hidden': 'true' },
			showCount && share > 0
				? m('span.voting__pillar', { style: { blockSize: `${share}%` } })
				: null,
		),
		m('span.voting__side', label),
	];
}
