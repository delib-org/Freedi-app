import m from 'mithril';
import { t } from '../lib/i18n';

export interface CountdownTimerAttrs {
	endsAt: number;
}

const URGENT_MS = 60 * 1000;

/** Burning-fuse round timer; shifts to urgency color in the last minute */
export function CountdownTimer(): m.Component<CountdownTimerAttrs> {
	let interval: ReturnType<typeof setInterval> | null = null;

	return {
		oncreate() {
			interval = setInterval(() => m.redraw(), 1000);
		},

		onremove() {
			if (interval) clearInterval(interval);
		},

		view(vnode) {
			const { endsAt } = vnode.attrs;
			const left = Math.max(0, endsAt - Date.now());
			const minutes = Math.floor(left / 60000);
			const seconds = Math.floor((left % 60000) / 1000);
			const urgent = left > 0 && left <= URGENT_MS;
			const total = 8 * 60 * 1000;
			const fraction = Math.min(1, left / total);

			return m('.fuse', { class: urgent ? 'fuse--urgent' : undefined }, [
				m('.fuse__track', [
					m('.fuse__burn', { style: { width: `${fraction * 100}%` } }),
					m('.fuse__spark'),
				]),
				m('span.fuse__time', [
					m('span.fuse__label', `${t('timer.left')}: `),
					`${minutes}:${String(seconds).padStart(2, '0')}`,
				]),
			]);
		},
	};
}
