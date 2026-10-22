import m from 'mithril';
import { registerSW } from 'virtual:pwa-register';
import './styles/global.scss';
import { initSentry, setSentryUser } from '@/lib/sentry';
import { afterLoad } from '@/lib/deferWork';
import { initAuth, waitForAuthReady, isGoogleSignedIn, getUserState } from '@/lib/user';
import { initI18n } from '@/lib/i18n';
import { mountAccessibilityWidget } from '@/components/AccessibilityWidget';
import { MainHub } from '@/views/MainHub';
import { Login } from '@/views/Login';
import { ClassCode } from '@/views/ClassCode';
import { FrontDoor } from '@/views/FrontDoor';

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

/** The front door: a Google-signed-in teacher never sees it (`/` -> `/t`);
 *  everyone else, students (anonymous) included, gets the code box. */
const frontDoor: m.RouteResolver = {
	onmatch() {
		return waitForAuthReady().then(() => {
			if (isGoogleSignedIn()) {
				m.route.set('/t', undefined, { replace: true });

				return { view: () => null };
			}

			return FrontDoor;
		});
	},
};

/** Teacher routes: Google-signed-in only (anonymous goes to /login, which comes
 *  back to the requested path), and the screen's code is fetched only when a
 *  teacher opens it, so the student's first screen carries none of it. */
function teacherRoute(load: () => Promise<m.Component>): m.RouteResolver {
	return {
		onmatch(_args, requestedPath: string) {
			return waitForAuthReady().then(() => {
				if (!isGoogleSignedIn()) {
					m.route.set('/login', { next: requestedPath }, { replace: true });

					return { view: () => null };
				}

				return load();
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
		'/c/:code': ClassCode,
		// Unknown paths (the old /q/*, /m/:mid/q/*, /invite) fall to this default route.
		'/': frontDoor,
		'/login': Login,
		'/m/:mid': MainHub,
		// Teacher routes (classroom). Lazy, so students never download them.
		'/t': teacherRoute(() => import('@/views/teacher/TeacherHome').then((mod) => mod.TeacherHome)),
		'/t/:mid': teacherRoute(() =>
			import('@/views/teacher/TeacherConsole').then((mod) => mod.TeacherConsole),
		),
		'/t/:mid/plan': teacherRoute(() =>
			import('@/views/teacher/PlanScreen').then((mod) => mod.PlanScreen),
		),
		'/t/:mid/table/:n': teacherRoute(() =>
			import('@/views/teacher/TableSheet').then((mod) => mod.TableSheet),
		),
		'/t/:mid/screen': teacherRoute(() =>
			import('@/views/teacher/TeacherProjector').then((mod) => mod.TeacherProjector),
		),
	});
});
