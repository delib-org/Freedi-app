import m from 'mithril';
import { logError } from '@freedi/shared-utils';
import { t } from '../lib/i18n';
import { getUserState, signOutTeacher } from '../lib/user';

/** Where a teacher lands after signing out: the sign-in screen, with a note that it worked */
export const SIGNED_OUT_ROUTE = '/teach/request?signedOut=1';

/** "Signed in as …" with the address isolated, so an LTR email never scrambles an RTL sentence */
export function signedInAs(email: string): string {
	return t('nav.signed_in_as', { email: `⁨${email}⁩` });
}

/**
 * Sign out and leave the teacher screen. `replace` so Back never reopens a
 * teacher screen. Throws if the sign-out did not complete, after logging it.
 */
export async function signOutAndLeave(): Promise<void> {
	try {
		await signOutTeacher();
	} catch (error: unknown) {
		logError(error, {
			operation: 'SignOutLink.signOutAndLeave',
			userId: getUserState().user?.uid,
		});
		throw error;
	}
	m.route.set(SIGNED_OUT_ROUTE, undefined, { replace: true });
}

/**
 * The account line on the signed-in-but-not-approved screens, where there is
 * no teacher menu: the email, and "Not you? Sign out" for the wrong Google
 * account on a shared computer.
 */
export function SignOutLink(): m.Component {
	let failed = false;

	function signOut(): void {
		failed = false;
		signOutAndLeave().catch(() => {
			failed = true;
			m.redraw();
		});
	}

	return {
		view() {
			const email = getUserState().user?.email;

			return m('.account-line', [
				email ? m('span.account-line__email', signedInAs(email)) : null,
				m('button.account-line__link', { type: 'button', onclick: signOut }, t('nav.not_you')),
				failed ? m('p.access-panel__error', { role: 'alert' }, t('nav.sign_out_failed')) : null,
			]);
		},
	};
}
