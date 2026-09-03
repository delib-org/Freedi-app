import m from 'mithril';
import { t } from '../lib/i18n';
import { Icon, type IconName } from './Icon';
import {
	canPromptInstall,
	dismissInstallOffer,
	installOfferAvailable,
	isIOS,
	promptInstall,
} from '../lib/install';

/**
 * The home-screen offer: a card at the foot of the results screen.
 *
 * It is the last thing on the last screen, so it interrupts nothing, and it
 * says plainly what the icon buys — being told when classmates respond,
 * picking the game up at home, opening like a real app. Chrome gets the
 * real install prompt; an iOS browser cannot be prompted, so the button
 * unfolds the two-tap instructions instead.
 */
const BENEFITS: ReadonlyArray<{ icon: IconName; key: string }> = [
	{ icon: 'mail', key: 'install.benefit_notify' },
	{ icon: 'again', key: 'install.benefit_home' },
	{ icon: 'spark', key: 'install.benefit_app' },
];

export function InstallOffer(): m.Component {
	let iosStepsOpen = false;

	return {
		view() {
			if (!installOfferAvailable()) return null;
			const ios = !canPromptInstall() && isIOS();

			return m('section.card.stack.install-offer', { 'aria-label': t('install.title') }, [
				m('.install-offer__head', [
					m(
						'span.install-offer__icon',
						{ 'aria-hidden': 'true' },
						m(Icon, { name: 'square', size: 28 }),
					),
					m('h3.install-offer__title', t('install.title')),
				]),
				m('p.install-offer__lead', t('install.body')),
				m(
					'ul.install-offer__benefits',
					BENEFITS.map((benefit) =>
						m('li.install-offer__benefit', { key: benefit.key }, [
							m(
								'span.install-offer__benefit-icon',
								{ 'aria-hidden': 'true' },
								m(Icon, { name: benefit.icon, size: 18 }),
							),
							m('span', t(benefit.key)),
						]),
					),
				),
				ios && iosStepsOpen ? m('p.install-offer__ios', t('install.ios_hint')) : null,
				m('.install-offer__actions', [
					m(
						'button.btn.btn--primary',
						{
							type: 'button',
							onclick: () => {
								if (ios) {
									iosStepsOpen = !iosStepsOpen;

									return;
								}
								void promptInstall();
							},
						},
						ios ? t('install.how') : t('install.action'),
					),
					m(
						'button.btn.btn--ghost.btn--sm',
						{ type: 'button', onclick: dismissInstallOffer },
						t('install.later'),
					),
				]),
			]);
		},
	};
}
