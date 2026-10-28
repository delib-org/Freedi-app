import m from 'mithril';
import '@/styles/teacher-challenge.scss';
import { t } from '@/lib/i18n';

/**
 * The plan screen's warning while the lesson has no Proposals question. The
 * lesson can still be saved as a draft; it cannot be started (the console
 * refuses to leave Waiting). The button takes the teacher straight to the
 * question's box.
 */

const CHALLENGE_INPUT = '.plan-card__text--challenge';

/** Bring the Proposals question's box into view and put the cursor in it. */
export function focusChallengeInput(): void {
	const input = document.querySelector<HTMLInputElement>(CHALLENGE_INPUT);
	if (!input) return;
	const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	input.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
	input.focus({ preventScroll: true });
}

/** `/t/:mid/plan?focus=challenge` (the console's link): do the same on arrival. */
export function focusChallengeFromRoute(): void {
	if (m.route.param('focus') !== 'challenge') return;
	window.requestAnimationFrame(focusChallengeInput);
}

export const PlanChallengeWarning: m.Component = {
	view() {
		return m(
			'section.challenge-warning',
			{ role: 'status', 'aria-labelledby': 'challenge-warning-title' },
			[
				m('h2.challenge-warning__title', { id: 'challenge-warning-title' }, [
					m('span.challenge-warning__mark', { 'aria-hidden': 'true' }, '!'),
					m('span', t('plan.challenge.missing_title')),
				]),
				m('p.challenge-warning__text', t('plan.challenge.missing')),
				m(
					'button.btn.btn--primary.btn--small.challenge-warning__action',
					{
						type: 'button',
						'data-testid': 'challenge-warning-action',
						onclick: focusChallengeInput,
					},
					t('plan.challenge.missing_action'),
				),
			],
		);
	},
};
