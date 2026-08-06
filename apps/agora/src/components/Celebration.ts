import m from 'mithril';
import { t } from '../lib/i18n';
import { getCelebration, dismissCelebration } from '../lib/celebration';

const SPARK_COUNT = 18;

/**
 * Full-screen "הידד!" moment: a burst of golden sparks around a popup that
 * quotes the improvement being celebrated. Positive reinforcement for the
 * behavior the game most wants to teach — making ideas better.
 * Animation is pure CSS and collapses to a static popup under
 * prefers-reduced-motion.
 *
 * These popups are the emotional core of the reward system, so they are
 * built as a real dialog: announced to screen readers, focus moved onto the
 * primary action, and Escape closes. A celebration nobody can perceive or
 * dismiss without a mouse is a reward the student never receives.
 */
export const CelebrationOverlay: m.Component = {
	view() {
		const payload = getCelebration();
		if (!payload) return null;

		return m(
			'.celebration',
			{
				onclick: (event: MouseEvent) => {
					if ((event.target as HTMLElement).classList.contains('celebration')) {
						dismissCelebration();
					}
				},
				onkeydown: (event: KeyboardEvent) => {
					if (event.key === 'Escape') dismissCelebration();
				},
			},
			[
				m(
					'.celebration__card',
					{
						role: 'alertdialog',
						'aria-modal': 'true',
						'aria-label': `${t('celebrate.hooray')} ${payload.message}`,
						tabindex: '-1',
						// Focus lands on the action the loop wants next (the travel
						// button when there is one, otherwise plain close)
						oncreate: (vnode: m.VnodeDOM) => {
							const focusTarget =
								vnode.dom.querySelector<HTMLElement>('button.btn--primary') ??
								(vnode.dom as HTMLElement);
							focusTarget.focus();
						},
					},
					[
						m(
							'.celebration__sparks',
							{ 'aria-hidden': 'true' },
							Array.from({ length: SPARK_COUNT }, (_, index) =>
								m('span.celebration__spark', {
									style: { '--spark-index': String(index) },
								}),
							),
						),
						m('.celebration__hooray', { 'aria-hidden': 'true' }, t('celebrate.hooray')),
						m('p.celebration__message', payload.message),
						payload.detail ? m('.celebration__detail', payload.detail) : null,
						// The one good-news moment with no button still says where the
						// loop goes next — the wait for "+2" becomes anticipation
						// instead of an invisible state
						payload.hint ? m('p.celebration__hint', payload.hint) : null,
						// With a continuation, IT is the star and plain-close steps
						// back: the popup invites the loop's next move, not a shrug
						payload.action
							? m(
									'button.btn.btn--primary.btn--full',
									{
										onclick: () => {
											payload.action?.run();
											dismissCelebration();
										},
									},
									payload.action.label,
								)
							: null,
						m(
							payload.action
								? 'button.btn.btn--ghost.btn--full'
								: 'button.btn.btn--primary.btn--full',
							{ onclick: dismissCelebration },
							t('celebrate.close'),
						),
					],
				),
			],
		);
	},
};
