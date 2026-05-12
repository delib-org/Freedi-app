import m from 'mithril';
import './styles/global.scss';
import { initSentry, setSentryUser } from '@/lib/sentry';
import { initAuth, waitForAuthReady, isSignedIn, getUserState } from '@/lib/user';
import { initI18n } from '@/lib/i18n';
import { mountAccessibilityWidget } from '@/components/AccessibilityWidget';
import { Solutions } from '@/views/Solutions';
import { Chat } from '@/views/Chat';
import { MainHub } from '@/views/MainHub';
import { Login } from '@/views/Login';
import { Main } from '@/views/Main';
import { Invite } from '@/views/Invite';

initSentry();
initAuth();
initI18n();

waitForAuthReady().then(() => {
	setSentryUser(getUserState().user?.uid ?? null);
});
// Mount the floating accessibility widget after i18n is ready so translated
// aria-labels are applied on first render.
mountAccessibilityWidget();

m.route.prefix = '';

/** Route guard: wait for auth to settle, then either render the protected
 *  component or bounce to /login carrying the requested path as ?next= so
 *  the user lands back where they meant to go. Used on `/` (the main page);
 *  share-link routes (/q, /m, /q/.../s) keep their public auto-anonymous
 *  behavior via `ensureUser()` inside each view. */
function requireAuth(component: m.Component): m.RouteResolver {
	return {
		onmatch(_args, requestedPath: string) {
			return waitForAuthReady().then(() => {
				if (!isSignedIn()) {
					m.route.set('/login', { next: requestedPath });

					return { view: () => null };
				}

				return component;
			});
		},
	};
}

const root = document.getElementById('app');
if (root) {
	m.route(root, '/', {
		'/': requireAuth(Main),
		'/login': Login,
		'/invite': Invite,
		// Param changes within the same route shape (e.g. follow-me from
		// `/m/X/q/A` to `/m/X/q/B`) don't trigger a fresh `oninit` in Mithril
		// 2 — the components themselves detect a param swap in
		// `onbeforeupdate` and re-init their subscriptions for the new id.
		'/q/:qid': Solutions,
		'/q/:qid/s/:sid': Chat,
		// Facilitated routes — entry via a main (top-parent) statement. Solutions
		// and Chat detect facilitated mode via the /m/ prefix on the active route.
		'/m/:mid': MainHub,
		'/m/:mid/q/:qid': Solutions,
		'/m/:mid/q/:qid/s/:sid': Chat,
	});
}
