import m from 'mithril';
import '@/styles/teacher-challenge.scss';
import { t } from '@/lib/i18n';

/**
 * The console's "no Proposals question" notice. At Waiting it says the class
 * cannot start yet; the link opens the plan with the question's box focused.
 */

export interface ChallengeNeededAttrs {
	mainId: string;
}

export const ChallengeNeeded: m.Component<ChallengeNeededAttrs> = {
	view({ attrs }) {
		return m(
			'section.challenge-warning.challenge-warning--console',
			{
				role: 'status',
				'aria-labelledby': 'challenge-needed-title',
				'data-testid': 'challenge-needed',
			},
			[
				m('h2.challenge-warning__title', { id: 'challenge-needed-title' }, [
					m('span.challenge-warning__mark', { 'aria-hidden': 'true' }, '!'),
					m('span', t('console.challenge.missing_title')),
				]),
				m('p.challenge-warning__text', t('console.challenge.missing_start')),
				m(
					m.route.Link,
					{
						class: 'btn btn--primary btn--small challenge-warning__action',
						href: `/t/${attrs.mainId}/plan?focus=challenge`,
					},
					t('console.challenge.go_plan'),
				),
			],
		);
	},
};
