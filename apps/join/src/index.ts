import m from 'mithril';
import { registerSW } from 'virtual:pwa-register';
import './styles/global.scss';
import { initSentry, setSentryUser } from '@/lib/sentry';
import { afterLoad } from '@/lib/deferWork';
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
// Kicked off before the i18n await below so the auth handshake and the locale
// chunk are in flight together rather than one after the other.
initAuth();
const i18nReady = initI18n();

// Service worker registration. We register manually (instead of letting the
// plugin auto-inject) so the rejection has a handler. Crawlers (e.g.
// Google-Read-Aloud), private-mode browsers, and sandboxed contexts reject
// `register()` — without a catch, that becomes an unhandled promise rejection.
//
// Held until after load + idle. Installing the worker kicks off the whole
// precache in one burst; doing that during boot meant a first-time visitor on
// a slow link was downloading the entire app shell a second time while still
// waiting for their question to arrive.
afterLoad(() => {
	registerSW({
		immediate: true,
		onRegisterError(error: unknown) {
			if (import.meta.env.DEV) {
				console.info('Service worker registration skipped:', error);
			}
		},
	});
});

waitForAuthReady().then(() => {
	setSentryUser(getUserState().user?.uid ?? null);
});
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

// Mount once the active language's dictionary is in hand. Every view calls
// `t()` synchronously during render, so mounting earlier would paint English
// and then swap — and for Hebrew/Arabic/Persian, reflow the whole page. The
// wait is bounded inside `initI18n` and overlaps the auth handshake; the boot
// splash in index.html is what's on screen meanwhile, and it is already showing
// the correct direction.
i18nReady.then(() => {
	// The accessibility widget lives outside Mithril's redraw loop and reads
	// translated aria-labels at construction time.
	mountAccessibilityWidget();

	if (!root) return;

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
});
