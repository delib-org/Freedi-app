import m from 'mithril';
import { getAuthState, signOutUser } from '../lib/auth';

interface NavItem {
	path: string;
	label: string;
	icon: string;
}

const navItems: NavItem[] = [
	{ path: '/', label: 'Dashboard', icon: '\u2302' },
	{ path: '/statements', label: 'Statements', icon: '\u2630' },
	{ path: '/users', label: 'Users', icon: '\u263A' },
	{ path: '/admins', label: 'Admins', icon: '\u2605' },
	{ path: '/research', label: 'Research', icon: '\u{1F52C}' },
];

export const Sidebar: m.Component = {
	view() {
		const currentRoute = m.route.get();
		const { user } = getAuthState();

		return m('.sidebar', [
			m('.sidebar__logo', [
				m('h1', 'Freedi'),
				m('span', 'Admin Dashboard'),
			]),
			m(
				'nav.sidebar__nav',
				navItems.map((item) => {
					const isActive =
						item.path === '/'
							? currentRoute === '/'
							: currentRoute.startsWith(item.path);

					return m(
						m.route.Link,
						{
							href: item.path,
							class: `sidebar__link${isActive ? ' sidebar__link--active' : ''}`,
						},
						[
							m('span.sidebar__icon', item.icon),
							item.label,
						]
					);
				})
			),
			m('.sidebar__footer', [
				user &&
					m('.sidebar__footer-user', user.email || user.displayName || 'Admin'),
				m(
					'button.sidebar__footer-signout',
					{ onclick: () => signOutUser() },
					'Sign out'
				),
			]),
		]);
	},
};
