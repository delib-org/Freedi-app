import m from 'mithril';
import { t } from '../lib/i18n';

export interface PointsPillAttrs {
	total: number;
}

/**
 * Balances move in quarter points (the rating credit is +0.5, and older
 * sessions carry −0.25 deductions), so the chase has to step in quarters
 * too. Stepping by whole numbers toward 2.75 overshot on every tick and the
 * exact-equality exit was never reached: the interval ran forever and the
 * displayed number oscillated between 2 and 3.
 */
const STEP_UNIT = 0.25;

/** Render a balance without lying: 2.75 stays 2.75, 3 stays "3" */
export function formatPoints(value: number): string {
	const rounded = Math.round(value / STEP_UNIT) * STEP_UNIT;

	return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, '');
}

/** Animated score pill — counts up toward the live total */
export function PointsPill(): m.Component<PointsPillAttrs> {
	let shown = 0;
	let timer: ReturnType<typeof setInterval> | null = null;

	function stop(): void {
		if (timer) clearInterval(timer);
		timer = null;
	}

	function chase(target: number): void {
		if (timer || shown === target) return;
		timer = setInterval(() => {
			const climbing = shown < target;
			// Always a whole number of quarter-steps, never smaller than one —
			// otherwise a fractional remainder can never be consumed
			const step = Math.max(
				STEP_UNIT,
				Math.ceil(Math.abs(target - shown) / 6 / STEP_UNIT) * STEP_UNIT,
			);
			shown += climbing ? step : -step;
			// Clamp on OVERSHOOT rather than waiting for exact equality: with a
			// fractional target, equality may never occur and the interval would
			// run forever while the number oscillates
			if (climbing ? shown >= target : shown <= target) {
				shown = target;
				stop();
			}
			m.redraw();
		}, 60);
	}

	return {
		oninit(vnode) {
			shown = vnode.attrs.total;
		},

		onremove() {
			stop();
		},

		view(vnode) {
			const { total } = vnode.attrs;
			if (total !== shown && !timer) chase(total);

			return m('.points-pill', { class: timer ? 'points-pill--ticking' : undefined }, [
				m('span.points-pill__value', formatPoints(shown)),
				m('span.points-pill__label', t('points.earned')),
			]);
		},
	};
}
