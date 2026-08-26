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
// Last, so the civic palette re-points tokens the components have already
// been written against. Inert until the document element carries the
// attribute — see lib/theme.ts.
import './styles/theme-civic.scss';
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
import { TopicWizard } from './views/teacher/TopicWizard';
import { TopicEditor } from './views/teacher/TopicEditor';

// Before anything paints: a civic square remembered from an earlier load
// wears its colours from the first frame rather than flashing the classroom
// palette while its session document is still in flight.
applyRememberedTheme();

// Before anything else async: the browser fires beforeinstallprompt once,
// early, and the home-screen suggestion needs it stashed for later.
initInstallCapture();

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
registerSW({ immediate: true });

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

const root = document.getElementById('app');

if (root) {
	m.route(root, '/', {
		'/': Home,
		'/join/:code': JoinSession,
		'/play/:id': GameController,
		'/teach': TeacherHome,
		'/teach/new': TopicWizard,
		'/teach/topic/:id': TopicEditor,
		'/teach/session/:id': TeacherSession,
	});
}
