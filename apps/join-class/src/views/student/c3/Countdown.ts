import m from 'mithril';
import { SPEAK_SECONDS } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { getServerOffset, remainingMs } from '@/lib/classroom/serverClock';
import { countdownView, idleCountdownText, shouldAnnounce } from '@/lib/classroom/c3Logic';

export interface CountdownAttrs {
	/** Server-clock epoch ms the interval ends; undefined = not started. */
	endsAt?: number;
	/** Length of the whole interval (the bar's 100%). Default: one speaking minute. */
	totalMs?: number;
}

const TICK_MS = 250;
export const MS_PER_SECOND = 1000;
export const SPEAK_MS = SPEAK_SECONDS * MS_PER_SECOND;

/** Milliseconds left right now on the server clock (the whole interval if not started). */
export function msLeft(endsAt: number | undefined, totalMs: number = SPEAK_MS): number {
	if (endsAt === undefined) return totalMs;

	return remainingMs(endsAt, Date.now(), getServerOffset(), { totalMs });
}

/** Real (not sped-up) milliseconds left; used to size an interval the first time it is seen. */
export function realMsLeft(endsAt: number): number {
	return remainingMs(endsAt, Date.now(), getServerOffset(), { speed: 1 });
}

class CountdownState {
	timer: ReturnType<typeof setInterval> | null = null;
	shownSeconds = -1;
	/** What the screen reader last heard (10 s steps and 10, 5, 0). */
	announced: number | null = null;
	endsAt: number | undefined;
	totalMs = SPEAK_MS;
}

/**
 * The big countdown of the screens-down talk screen (UX §3): tabular digits,
 * the last 10 s in terracotta with two digits, "time's up" replacing the digits.
 * One interval per screen that redraws only when the shown second changes. A
 * screen reader hears `role="timer"` at 10 s steps and at 10, 5, 0, and the
 * "time's up" words once through a polite region.
 */
export const Countdown: m.ClassComponent<CountdownAttrs> = {
	oninit(vnode) {
		const self = new CountdownState();
		(vnode.state as { self?: CountdownState }).self = self;
		self.timer = setInterval(() => {
			const seconds = Math.ceil(msLeft(self.endsAt, self.totalMs) / MS_PER_SECOND);
			if (seconds !== self.shownSeconds) m.redraw();
		}, TICK_MS);
	},

	onremove(vnode) {
		const self = (vnode.state as { self?: CountdownState }).self;
		if (self?.timer) clearInterval(self.timer);
	},

	view(vnode) {
		const self = (vnode.state as { self?: CountdownState }).self ?? new CountdownState();
		const { endsAt } = vnode.attrs;
		const totalMs = vnode.attrs.totalMs ?? SPEAK_MS;
		self.endsAt = endsAt;
		self.totalMs = totalMs;
		const started = endsAt !== undefined;
		const view = countdownView(msLeft(endsAt, totalMs), totalMs);
		self.shownSeconds = view.seconds;
		if (started && shouldAnnounce(view.seconds)) self.announced = view.seconds;
		const over = started && view.over;
		const classes = [
			'count',
			started ? '' : 'count--idle',
			view.warn && started ? 'count--warn' : '',
			over ? 'count--over' : '',
		]
			.filter(Boolean)
			.join(' ');

		return m('div', { class: classes }, [
			over
				? m('p.count__over', { 'data-testid': 'time-over' }, t('turn.time_over'))
				: m(
						'p.count__num',
						{
							role: 'timer',
							'aria-live': 'off',
							'aria-label': started
								? t('turn.timer_label', { seconds: String(self.announced ?? view.seconds) })
								: undefined,
						},
						started ? view.text : idleCountdownText(Math.round(totalMs / MS_PER_SECOND)),
					),
			m('span.count__bar', { 'aria-hidden': 'true' }, [
				m('span.count__fill', { style: `transform: scaleX(${started ? view.fraction : 1})` }),
			]),
			m('p.visually-hidden', { 'aria-live': 'polite' }, over ? t('turn.time_over') : ''),
		]);
	},
};
