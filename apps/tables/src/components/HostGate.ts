import m from 'mithril';
import { t } from '@/lib/i18n';
import { hostAuth, signInHost, startHostAuth } from '@/lib/hostAuth';
import { Shell } from '@/components/Shell';
import { StateBox } from '@/components/StateBox';

/**
 * Hosts sign in with Google. Until they do, every host route shows the
 * sign-in screen (the "no permission" state of the host list); once signed
 * in, `render` receives the host's uid.
 */
export interface HostGateAttrs {
	title: string;
	backHref?: string;
	wide?: boolean;
	render: (uid: string) => m.Children;
}

export const HostGate: m.ClosureComponent<HostGateAttrs> = () => ({
	oninit() {
		startHostAuth();
	},
	view({ attrs }) {
		const shellAttrs = { title: attrs.title, backHref: attrs.backHref, wide: attrs.wide };

		if (hostAuth.status === 'checking') {
			return m(Shell, shellAttrs, m(StateBox, { kind: 'loading' }));
		}

		if (hostAuth.status === 'signedOut' || !hostAuth.user) {
			return m(Shell, shellAttrs, [
				m('section.card.card--center', [
					m('p', t('tableAssignment.host.signInIntro')),
					m(
						'button.btn.btn--primary',
						{ type: 'button', onclick: () => void signInHost() },
						t('tableAssignment.signIn.google'),
					),
					hostAuth.signInFailed
						? m('p.notice.notice--error', { role: 'alert' }, t('tableAssignment.host.signInFailed'))
						: null,
				]),
			]);
		}

		return attrs.render(hostAuth.user.uid);
	},
});
