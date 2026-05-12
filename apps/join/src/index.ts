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

/** Force Mithril to remount the component when the named URL param changes,
 *  rather than reusing the existing instance with stale `oninit` state. The
 *  follow-me feature drives the participant from `/m/X/q/A` to `/m/X/q/B`;
 *  without a per-`qid` key, Mithril keeps the previous Solutions instance —
 *  the URL updates but `loadQuestion(newQid)` is never called, so the view
 *  keeps showing the previous question. The same applies to Chat keyed by
 *  `sid`, and to the workspace-root key on facilitated routes (so swapping
 *  `mid` from one workspace to another also remounts). */
function keyedRoute(component: m.Component, ...keyParams: string[]): m.RouteResolver {
	return {
		render() {
			const key = keyParams.map((p) => m.route.param(p) ?? '').join('|');

			return m(component, { key });
		},
	};
}

const root = document.getElementById('app');
if (root) {
	m.route(root, '/', {
		'/': requireAuth(Main),
		'/login': Login,
		'/invite': Invite,
		'/q/:qid': keyedRoute(Solutions, 'qid'),
		'/q/:qid/s/:sid': keyedRoute(Chat, 'qid', 'sid'),
		// Facilitated routes — entry via a main (top-parent) statement. Solutions
		// and Chat detect facilitated mode via the /m/ prefix on the active route.
		'/m/:mid': keyedRoute(MainHub, 'mid'),
		'/m/:mid/q/:qid': keyedRoute(Solutions, 'mid', 'qid'),
		'/m/:mid/q/:qid/s/:sid': keyedRoute(Chat, 'mid', 'qid', 'sid'),
	});
}
