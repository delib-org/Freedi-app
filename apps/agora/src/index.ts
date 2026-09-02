import m from 'mithril';
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
import { initSentry } from './lib/sentry';
import { initAuth, completeRedirectSignIn, getUserState } from './lib/user';
import { initI18n } from './lib/i18n';
import { getSessionState } from './lib/session';
import { Home } from './views/Home';
import { JoinSession } from './views/JoinSession';
import { GameController } from './views/GameController';
import { TeacherHome } from './views/teacher/TeacherHome';
import { TeacherSession } from './views/teacher/TeacherSession';
import { TopicWizard } from './views/teacher/TopicWizard';
import { TopicEditor } from './views/teacher/TopicEditor';

// Error reporting first, so anything thrown during boot is captured. A crash
// here happens in front of a classroom, and until now nothing recorded it.
initSentry();

initAuth();
// A teacher whose popup was blocked came back via a full page redirect; this
// is where that round trip is collected. No-op on every other load.
void completeRedirectSignIn();
initI18n();

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
