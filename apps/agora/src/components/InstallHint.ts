import m from 'mithril';
import { t } from '../lib/i18n';
import { Icon } from './Icon';
import {
	canPromptInstall,
	dismissInstallHint,
	installHintVisible,
	isIOS,
	promptInstall,
} from '../lib/install';

/**
 * The home-screen suggestion, as a card at the foot of the screen.
 *
 * It exists only after a smart moment asked for it (see lib/install.ts) and
 * closes for good on either answer. Chrome gets the real install prompt; an
 * iOS browser cannot be prompted, so the button unfolds the two-tap
 * instructions instead.
 */
export function InstallHint(): m.Component {
	let iosStepsOpen = false;

	return {
		view() {
			if (!installHintVisible()) return null;
			const ios = !canPromptInstall() && isIOS();

			return m('.install-hint', { role: 'dialog', 'aria-label': t('install.title') }, [
				m(
					'span.install-hint__icon',
					{ 'aria-hidden': 'true' },
					m(Icon, { name: 'mail', size: 22 }),
				),
				m('.install-hint__body', [
					m('strong.install-hint__title', t('install.title')),
					m('p.install-hint__text', t('install.body')),
					ios && iosStepsOpen ? m('p.install-hint__text', t('install.ios_hint')) : null,
				]),
				m('.install-hint__actions', [
					m(
						'button.install-hint__go',
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
						'button.install-hint__later',
						{ type: 'button', onclick: dismissInstallHint },
						t('install.later'),
					),
				]),
			]);
		},
	};
}
