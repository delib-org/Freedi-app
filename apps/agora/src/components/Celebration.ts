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
			},
			[
				m('.celebration__card', [
					m(
						'.celebration__sparks',
						Array.from({ length: SPARK_COUNT }, (_, index) =>
							m('span.celebration__spark', {
								style: { '--spark-index': String(index) },
							}),
						),
					),
					m('.celebration__hooray', t('celebrate.hooray')),
					m('p.celebration__message', payload.message),
					payload.detail ? m('.celebration__detail', payload.detail) : null,
					m(
						'button.btn.btn--primary.btn--full',
						{ onclick: dismissCelebration },
						t('celebrate.close'),
					),
				]),
			],
		);
	},
};
