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

/** How long a number takes to roll from its old value to its new one */
const ROLL_MS = 600;
const POP_MS = 450;

function reducedMotion(): boolean {
	return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** What each rolling number is showing right now, and the frame driving it */
const rolling = new WeakMap<HTMLElement, { shown: number; frame: number }>();

/**
 * Roll a number to `to`, and pop it when it lands somewhere new.
 *
 * The text is written here, never as a vnode child: Mithril keeps a handle on
 * the text node it created, and a tween replacing that node under it would
 * leave the next redraw writing into a detached node.
 */
function rollTo(dom: HTMLElement, to: number, suffix: string): void {
	const state = rolling.get(dom);
	const from = state?.shown ?? to;
	if (state) cancelAnimationFrame(state.frame);

	if (from === to || reducedMotion()) {
		rolling.set(dom, { shown: to, frame: 0 });
		dom.textContent = `${to}${suffix}`;

		return;
	}

	if (typeof dom.animate === 'function') {
		dom.animate(
			[{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }],
			{ duration: POP_MS, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
		);
	}

	const start = performance.now();
	const entry = { shown: from, frame: 0 };
	rolling.set(dom, entry);
	const step = (now: number): void => {
		const progress = Math.min(1, (now - start) / ROLL_MS);
		const eased = 1 - (1 - progress) ** 3;
		entry.shown = progress === 1 ? to : Math.round(from + (to - from) * eased);
		dom.textContent = `${entry.shown}${suffix}`;
		if (progress < 1) entry.frame = requestAnimationFrame(step);
	};
	entry.frame = requestAnimationFrame(step);
}

/** A number span that rolls between values instead of jumping */
function rollingNumber(selector: string, value: number, suffix = ''): m.Children {
	return m(selector, {
		oncreate: (vnode: m.VnodeDOM) => rollTo(vnode.dom as HTMLElement, value, suffix),
		onupdate: (vnode: m.VnodeDOM) => rollTo(vnode.dom as HTMLElement, value, suffix),
		onremove: (vnode: m.VnodeDOM) => {
			const state = rolling.get(vnode.dom as HTMLElement);
			if (state) cancelAnimationFrame(state.frame);
		},
	});
}

/**
 * The pillar flashes when its own side gains or loses a vote, so the eye is
 * pulled to WHICH side moved — the other pillar re-levels too (its share
 * changed), but quietly.
 */
function flashOnChange(dom: HTMLElement, count: number): void {
	const before = dom.dataset.count;
	dom.dataset.count = String(count);
	if (before === undefined || before === String(count)) return;
	if (reducedMotion() || typeof dom.animate !== 'function') return;
	dom.animate(
		[{ filter: 'brightness(1)' }, { filter: 'brightness(1.35)' }, { filter: 'brightness(1)' }],
		{ duration: POP_MS * 2, easing: 'ease-out' },
	);
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
 *
 * Every change is animated: the pillar glides to its new height, the numbers
 * roll and pop, and the side that actually moved flashes. The pillar stays
 * mounted at 0% so a side's first vote (and its last) glides too, instead of
 * appearing or vanishing.
 */
export function standingBar({ label, count, share, showCount }: StandingBarAttrs): m.Children {
	return [
		showCount
			? m('span.voting__count.voting__count--standing', [
					rollingNumber('span.voting__votes', count),
					rollingNumber('span.voting__share', share, '%'),
				])
			: null,
		m(
			'span.voting__track',
			{ 'aria-hidden': 'true' },
			showCount
				? m('span.voting__pillar', {
						style: { blockSize: `${share}%` },
						oncreate: (vnode: m.VnodeDOM) => {
							(vnode.dom as HTMLElement).dataset.count = String(count);
						},
						onupdate: (vnode: m.VnodeDOM) => flashOnChange(vnode.dom as HTMLElement, count),
					})
				: null,
		),
		m('span.voting__side', label),
	];
}
