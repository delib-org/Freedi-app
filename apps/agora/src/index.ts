/// <reference types="vite-plugin-pwa/client" />
import { startUsageHeartbeat } from './lib/usageHeartbeat';
import m from 'mithril';
import { registerSW } from 'virtual:pwa-register';
import { checkForAppUpdate } from './lib/appUpdate';
// Self-hosted so the PWA precaches them: classroom devices get the real faces
// offline, and no student's IP reaches a third-party font CDN.
// Assistant = body. Alef = titles & buttons; it ships 400/700 only, so never
// ask for 500/600 with --font-display or the browser fakes the bold.
import '@fontsource/assistant/400.css';
import '@fontsource/assistant/600.css';
import '@fontsource/assistant/700.css';
import '@fontsource/alef/400.css';
import '@fontsource/alef/700.css';
import './styles/global.scss';
import './styles/components.scss';
import './styles/icons.scss';
// Last, so the looks re-point tokens the components have already been
// written against. Each block is inert until the document element carries
// its attribute — see lib/theme.ts. Candy is the default; custom grows a
// palette from four seeds and so must come after candy, whose furniture it
// borrows.
import './styles/theme-civic.scss';
import './styles/theme-candy.scss';
import './styles/theme-custom.scss';
import { initSentry } from './lib/sentry';
import { BootBanner, flushEarlyErrors, installRuntimeGuards, markBooted } from './lib/boot';
import { initAuth, completeRedirectSignIn, getUserState } from './lib/user';
import { prepareGoogleSignIn } from './lib/firebase';
import { initI18n } from './lib/i18n';
import { initInstallCapture } from './lib/install';
import { getSessionState } from './lib/session';
import { identitiesSubscribed } from './lib/teacherConsole';
import { applyRememberedTheme } from './lib/theme';
import { Home } from './views/Home';
import { JoinSession } from './views/JoinSession';
import { GameController } from './views/GameController';
import { trackRoutes } from './lib/routeTrail';

// Error reporting first, so anything thrown during boot is captured. A crash
// here happens in front of a classroom, and until now nothing recorded it.
initSentry();
// Then the runtime guards: from here on nothing thrown goes unseen or unsaid,
// and whatever the inline boot guard in index.html caught first is reported.
installRuntimeGuards();
flushEarlyErrors();

// Before anything paints: the look remembered from an earlier load — or the
// default — is worn from the first frame rather than flashing the token
// file's base palette while the session document is still in flight.
applyRememberedTheme();

// Before anything else async: the browser fires beforeinstallprompt once,
// early, and the home-screen suggestion needs it stashed for later.
initInstallCapture();

// Dedicated village deployments keep teacher and student navigation in this world.
if (
	import.meta.env.VITE_DEFAULT_WORLD === 'village' &&
	!new URLSearchParams(location.search).has('world')
) {
	const url = new URL(location.href);
	url.searchParams.set('world', 'village');
	history.replaceState(null, '', url);
}

initAuth();
// A teacher whose popup was blocked came back via a full page redirect; this
// is where that round trip is collected. No-op on every other load.
void completeRedirectSignIn();
// Mounting waits for the visitor's dictionary (Hebrew is bundled, so it is instant
// there): every view calls t() synchronously, and mounting first would flash
// the default language.
const i18nReady = initI18n();

// Register through the plugin's virtual module rather than the injected
// script: with a plain register, a fresh deploy's worker takes control
// silently and the WHOLE first session after every deploy still runs the
// previous bundle (observed: an installed PWA showing yesterday's UI). The
// virtual module reloads the page the moment a new worker takes over —
// seconds after launch, before anyone has typed anything worth losing.
// No-op in dev, where the killswitch below rules instead.
registerSW({
	immediate: true,
	onRegisteredSW(_url, registration) {
		// Explicitly check on entry, including when this page came from an older cache.
		void registration
			?.update()
			.catch((error) => console.warn('[Agora] Update check failed', error));
		// A phone keeps a tab for days: check again each time it comes to the
		// front, so a deploy (a new kind of step included) reaches it before
		// the session it is watching does
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'visible') checkForAppUpdate();
		});
	},
});

// A PWA service worker left behind by a production build served on this
// origin hijacks the dev server and pins the app to a stale precache
// (symptom: code changes "never arrive"). Dev always evicts it.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
	void navigator.serviceWorker.getRegistrations().then((registrations) => {
		registrations.forEach((registration) => void registration.unregister());
	});
	if ('caches' in window) {
		void caches.keys().then((keys) => {
			keys
				.filter((key) => key.startsWith('workbox-') || key.startsWith('agora-'))
				.forEach((key) => void caches.delete(key));
		});
	}
}

// Dev-only introspection for e2e debugging
if (import.meta.env.DEV) {
	interface AgoraDebugWindow {
		__agoraDebug?: () => { user: unknown; session: unknown; teacherConsole: unknown };
	}
	(window as unknown as AgoraDebugWindow).__agoraDebug = () => ({
		user: getUserState(),
		session: getSessionState(),
		// Whether this device ever subscribed to the real names — the wall never does
		teacherConsole: { identitiesSubscribed: identitiesSubscribed() },
	});
}

/**
 * A screen that belongs to one id, rebuilt when the id changes.
 *
 * Mithril keeps a component instance alive when only the route parameter
 * moves: /teach/session/A → /teach/session/B re-renders the SAME closure,
 * which is still holding A's listeners and A's sessionId. Every one of these
 * screens captures its id at construction, so the router has to hand them a
 * new instance — a key on the rendered vnode is what asks for one.
 *
 * Unreachable until the teacher's navigation bar existed, and the very first
 * thing it lets a teacher do: walk from one live lesson to another.
 */
function byId(component: m.ComponentTypes<{ id: string }>): m.RouteResolver<{ id: string }> {
	return {
		render(vnode) {
			const id = String(vnode.attrs.id);

			// Wrapped in a fragment on purpose: a key is only honoured inside a
			// keyed list, and a resolver's return value is handed to the diff as
			// a bare root, where the key would be ignored and the old instance
			// kept — the very thing this is here to prevent.
			return [m(component, { key: id, id })];
		},
	};
}

/**
 * Teacher and supervisor screens are downloaded when somebody opens them.
 * A student joining with a code never visits any of them, and they were
 * more than half of the entry bundle. Opening one also starts warming the
 * Google sign-in iframe, so it is ready before the button is pressed.
 */
type ViewModule = Record<string, unknown>;
type Loader = () => Promise<ViewModule>;

function loadView<A>(load: Loader, name: string): Promise<m.ComponentTypes<A>> {
	prepareGoogleSignIn();

	return load().then((mod) => mod[name] as m.ComponentTypes<A>);
}

function lazyView<A = Record<string, never>>(load: Loader, name: string): m.RouteResolver<A> {
	return { onmatch: () => loadView<A>(load, name) };
}

/** `lazyView` + the keyed-by-id behaviour of `byId`. */
function lazyById(load: Loader, name: string): m.RouteResolver<{ id: string }> {
	return {
		onmatch: () => loadView<{ id: string }>(load, name),
		render(vnode) {
			const id = String(vnode.attrs.id);

			return [m(vnode.tag as m.ComponentTypes<{ id: string }>, { key: id, id })];
		},
	};
}

/** A lazy view keyed by two route parameters. */
function lazyByPair<K1 extends string, K2 extends string>(
	load: Loader,
	name: string,
	first: K1,
	second: K2,
): m.RouteResolver<Record<K1 | K2, string>> {
	type Attrs = Record<K1 | K2, string>;

	return {
		onmatch: () => loadView<Attrs>(load, name),
		render(vnode) {
			const attrs = {
				[first]: String(vnode.attrs[first]),
				[second]: String(vnode.attrs[second]),
			} as Attrs;

			return [
				m(vnode.tag as m.ComponentTypes<Attrs>, {
					key: `${attrs[first]}/${attrs[second]}`,
					...attrs,
				}),
			];
		},
	};
}

const teacherSession: Loader = () => import('./views/teacher/TeacherSession');

/**
 * An old address that now lives elsewhere. Replaces the history entry, so the
 * back button does not bounce the teacher off the redirect.
 */
function redirectTo(target: (args: Record<string, string | undefined>) => string): m.RouteResolver {
	return {
		onmatch(args) {
			m.route.set(target(args as Record<string, string | undefined>), undefined, { replace: true });

			return new Promise<never>(() => undefined);
		},
	};
}

const root = document.getElementById('app');

function mountApp(): void {
	if (!root) return;

	trackRoutes();
	m.route(root, '/', {
		'/': Home,
		'/join/:code': JoinSession,
		'/play/:id': byId(GameController),
		'/supervise': lazyView(() => import('./views/supervise/SuperviseHome'), 'SuperviseHome'),
		'/supervise/teacher/:schoolId/:uid': lazyByPair(
			() => import('./views/supervise/SuperviseTeacher'),
			'SuperviseTeacher',
			'schoolId',
			'uid',
		),
		'/supervise/class/:id': lazyById(
			() => import('./views/supervise/SuperviseClass'),
			'SuperviseClass',
		),
		'/supervise/student/:id': lazyById(
			() => import('./views/supervise/SuperviseStudent'),
			'SuperviseStudent',
		),
		'/teach': lazyView(() => import('./views/teacher/TeacherHome'), 'TeacherHome'),
		// Ask to teach; `?school=<id>` is a school's own sign-up link
		'/teach/request': lazyView(() => import('./views/teacher/AccessRequest'), 'AccessRequest'),
		'/teach/activity': lazyView(() => import('./views/teacher/TeacherActivity'), 'TeacherActivity'),
		'/teach/words': lazyView(
			() => import('./views/teacher/TeacherBannedWords'),
			'TeacherBannedWords',
		),
		'/teach/lessons': lazyView(() => import('./views/teacher/PastLessons'), 'PastLessons'),
		'/teach/start': lazyView(() => import('./views/teacher/StartGame'), 'StartGame'),
		// "Scenario" is the one word: the old /topic, /new and /library/mine
		// links (bookmarks, e-mails, the e2e scripts) still land in the right place
		'/teach/scenarios': lazyView(() => import('./views/teacher/MyScenarios'), 'MyScenarios'),
		'/teach/scenarios/new': lazyView(() => import('./views/teacher/TopicWizard'), 'TopicWizard'),
		'/teach/scenarios/:id': lazyById(() => import('./views/teacher/TopicEditor'), 'TopicEditor'),
		'/teach/new': redirectTo(() => '/teach/scenarios/new'),
		'/teach/topic/:id': redirectTo((args) => `/teach/scenarios/${String(args.id)}`),
		'/teach/session/:id': lazyById(teacherSession, 'TeacherSession'),
		// The same console, showing the room as the students see it. The same
		// keyed component on both routes, so flipping keeps the listeners.
		'/teach/session/:id/class': lazyById(teacherSession, 'TeacherSession'),
		'/teach/screen/:id': lazyById(
			() => import('./views/teacher/ProjectorScreen'),
			'ProjectorScreen',
		),
		'/teach/class/:id': lazyById(() => import('./views/teacher/TeacherClass'), 'TeacherClass'),
		'/teach/class/:id/student/:memberId': lazyByPair(
			() => import('./views/teacher/TeacherStudent'),
			'TeacherStudent',
			'id',
			'memberId',
		),
		'/teach/report/:id': lazyById(() => import('./views/teacher/GameReport'), 'GameReport'),
		'/teach/library': lazyView(
			() => import('./views/teacher/scenarioLibrary/LibraryHome'),
			'LibraryHome',
		),
		'/teach/library/mine': redirectTo(() => '/teach/scenarios'),
		'/teach/library/admin': lazyView(
			() => import('./views/teacher/scenarioLibrary/LibraryAdmin'),
			'LibraryAdmin',
		),
		'/teach/library/:id': lazyById(
			() => import('./views/teacher/scenarioLibrary/LibraryScenario'),
			'LibraryScenario',
		),
	});
	// The banner lives beside the router's root so a crash in any view leaves it standing
	const bannerHost = document.createElement('div');
	bannerHost.id = 'boot-banner';
	root.before(bannerHost);
	m.mount(bannerHost, BootBanner);
	markBooted();
}

void i18nReady.then(mountApp);

startUsageHeartbeat();
