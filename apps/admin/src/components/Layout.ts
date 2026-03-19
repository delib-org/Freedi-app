import m from 'mithril';
import { getAuthState, signIn, signOutUser } from '../lib/auth';
import { Sidebar } from './Sidebar';

export function Layout(): m.Component {
	return {
		view(vnode: m.Vnode) {
			const { user, loading, isAdmin } = getAuthState();

			if (loading) {
				return m('.spinner', m('.spinner__circle'));
			}

			if (!user) {
				return m('.login-screen', [
					m('.login-screen__title', 'Freedi Admin'),
					m('.login-screen__subtitle', 'Sign in to access the dashboard'),
					m(
						'button.login-screen__btn',
						{ onclick: () => signIn() },
						'Sign in with Google'
					),
				]);
			}

			if (!isAdmin) {
				return m('.login-screen', [
					m('.login-screen__title', 'Access Denied'),
					m('.login-screen__denied', [
						m('p', 'Your account does not have admin privileges.'),
						m('p', `Signed in as: ${user.email || user.displayName}`),
						m(
							'button.login-screen__signout',
							{ onclick: () => signOutUser() },
							'Sign out'
						),
					]),
				]);
			}

			return m('.app', [
				m('.app__sidebar', m(Sidebar)),
				m('.app__content', vnode.children),
			]);
		},
	};
}
