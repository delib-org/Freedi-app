import m from 'mithril';
import './styles/global.scss';
import './styles/components.scss';
import { initAuth, getUserState } from './lib/user';
import { initI18n } from './lib/i18n';
import { getSessionState } from './lib/session';
import { Home } from './views/Home';
import { JoinSession } from './views/JoinSession';
import { GameController } from './views/GameController';
import { TeacherHome } from './views/teacher/TeacherHome';
import { TeacherSession } from './views/teacher/TeacherSession';
import { TopicWizard } from './views/teacher/TopicWizard';
import { TopicEditor } from './views/teacher/TopicEditor';

initAuth();
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
