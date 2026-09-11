/// <reference types="vite-plugin-pwa/client" />
import m from 'mithril';
import { registerSW } from 'virtual:pwa-register';
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
import { initI18n } from './lib/i18n';
import { initInstallCapture } from './lib/install';
import { getSessionState } from './lib/session';
import { applyRememberedTheme } from './lib/theme';
import { Home } from './views/Home';
import { JoinSession } from './views/JoinSession';
import { GameController } from './views/GameController';
import { TeacherHome } from './views/teacher/TeacherHome';
import { TeacherSession } from './views/teacher/TeacherSession';
import { ProjectorScreen } from './views/teacher/ProjectorScreen';
import { TopicWizard } from './views/teacher/TopicWizard';
import { TopicEditor } from './views/teacher/TopicEditor';
import { StartGame } from './views/teacher/StartGame';
import { TeacherClass } from './views/teacher/TeacherClass';
import { GameReport } from './views/teacher/GameReport';

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
initI18n();

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
		__agoraDebug?: () => { user: unknown; session: unknown };
	}
	(window as unknown as AgoraDebugWindow).__agoraDebug = () => ({
		user: getUserState(),
		session: getSessionState(),
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

const root = document.getElementById('app');

if (root) {
	m.route(root, '/', {
		'/': Home,
		'/join/:code': JoinSession,
		'/play/:id': byId(GameController),
		'/teach': TeacherHome,
		'/teach/new': TopicWizard,
		'/teach/start': StartGame,
		'/teach/topic/:id': byId(TopicEditor),
		'/teach/session/:id': byId(TeacherSession),
		'/teach/screen/:id': byId(ProjectorScreen),
		'/teach/class/:id': byId(TeacherClass),
		'/teach/report/:id': byId(GameReport),
	});
	// The banner lives beside the router's root so a crash in any view leaves it standing
	const bannerHost = document.createElement('div');
	bannerHost.id = 'boot-banner';
	root.before(bannerHost);
	m.mount(bannerHost, BootBanner);
	markBooted();
}
