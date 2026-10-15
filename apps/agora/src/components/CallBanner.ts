import m from 'mithril';
import { t } from '../lib/i18n';
import { Icon } from './Icon';

/**
 * The teacher's call, held for a student who is mid-sentence.
 *
 * Everyone else is walked at once. A student typing gets a short grace —
 * the bar shows where the class is going and counts down; "go now" leaves
 * early, "one more moment" buys one extension. Whatever they typed is
 * parked with its question (`penState`) and waits for them, so the bar
 * never has to say "you will lose your text": it will not.
 *
 * Props in, vnodes out; the clock runs in the controller.
 */
export interface CallBannerAttrs {
	/** The place, in the student's words */
	place: string;
	secondsLeft: number;
	onGo: () => void;
	/** Absent once the one extension is spent */
	onMoreTime?: () => void;
}

export const CallBanner: m.Component<CallBannerAttrs> = {
	view({ attrs }) {
		const { place, secondsLeft, onGo, onMoreTime } = attrs;

		return m(
			'.call-banner',
			{ role: 'alert', 'aria-live': 'assertive', 'data-call-banner': 'true' },
			[
				m('span.call-banner__icon', { 'aria-hidden': 'true' }, m(Icon, { name: 'flag', size: 20 })),
				m('.call-banner__text', [
					m('strong.call-banner__title', t('call.typing_title', { place })),
					m('span.call-banner__hint', t('call.typing_hint', { s: secondsLeft })),
				]),
				m('.call-banner__actions', [
					onMoreTime
						? m(
								'button.btn.btn--ghost.btn--sm',
								{ type: 'button', onclick: onMoreTime },
								t('call.more_time'),
							)
						: null,
					m(
						'button.btn.btn--primary.btn--sm.call-banner__go',
						{ type: 'button', onclick: onGo },
						t('call.go_now'),
					),
				]),
			],
		);
	},
};
