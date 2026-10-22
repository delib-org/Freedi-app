import m from 'mithril';
import { getUserState, signOut } from '@/lib/user';
import { t } from '@/lib/i18n';
import { BrandLogo } from '@/components/BrandLogo';

/**
 * The state every `/t/:mid*` route shows when the signed-in account is not the
 * lesson's teacher (IA 13.1, UX 13.G). Never a redirect into the student view:
 * the teacher on a second computer needs to know WHICH account is signed in,
 * and has three ways out - switch account (back here after Google), the lesson
 * list, or the code box.
 */

function accountName(): string {
	const user = getUserState().user;

	return user?.displayName || user?.email || '';
}

async function switchAccount(): Promise<void> {
	const path = `${window.location.pathname}${window.location.search}`;
	try {
		await signOut();
	} catch (err) {
		console.error('[NotYourLesson] sign-out failed:', err);
	}
	m.route.set('/login', { next: path });
}

export const NotYourLesson: m.Component = {
	view() {
		const name = accountName();

		return m('main.door', [
			m('header.door__header', m(BrandLogo, { size: 48, className: 'door__logo' })),
			m('h1.door__title', { tabindex: '-1', oncreate: focusHeading }, t('teacher.denied.title')),
			name ? m('p.door__account', t('teacher.account', { name })) : null,
			m('.door__actions', [
				m(
					'button.btn.btn--primary.door__enter',
					{ type: 'button', onclick: () => void switchAccount() },
					t('teacher.denied.switch'),
				),
				m(
					m.route.Link,
					{ class: 'btn btn--secondary door__enter', href: '/t' },
					t('teacher.home.title'),
				),
			]),
			m(
				'.door__alt',
				m(m.route.Link, { class: 'btn btn--tertiary', href: '/' }, t('login.have_code')),
			),
		]);
	},
};

function focusHeading(vnode: m.VnodeDOM): void {
	(vnode.dom as HTMLElement).focus();
}
