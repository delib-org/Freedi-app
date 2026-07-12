import m from 'mithril';
import { t } from '../lib/i18n';

export interface PointsPillAttrs {
	total: number;
}

/** Animated score pill — counts up toward the live total */
export function PointsPill(): m.Component<PointsPillAttrs> {
	let shown = 0;
	let timer: ReturnType<typeof setInterval> | null = null;

	function chase(target: number): void {
		if (timer || shown === target) return;
		timer = setInterval(() => {
			const step = Math.max(1, Math.ceil(Math.abs(target - shown) / 6));
			shown += shown < target ? step : -step;
			if (Math.abs(target - shown) <= 0) {
				shown = target;
				if (timer) clearInterval(timer);
				timer = null;
			}
			m.redraw();
		}, 60);
	}

	return {
		oninit(vnode) {
			shown = vnode.attrs.total;
		},

		onremove() {
			if (timer) clearInterval(timer);
		},

		view(vnode) {
			const { total } = vnode.attrs;
			if (total !== shown && !timer) chase(total);

			return m('.points-pill', { class: timer ? 'points-pill--ticking' : undefined }, [
				m('span.points-pill__value', String(shown)),
				m('span.points-pill__label', t('points.earned')),
			]);
		},
	};
}
