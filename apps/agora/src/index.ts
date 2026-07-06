import m from 'mithril';
import './styles/global.scss';
import './styles/components.scss';
import { initAuth } from './lib/user';
import { initI18n } from './lib/i18n';
import { Home } from './views/Home';
import { JoinSession } from './views/JoinSession';
import { GameController } from './views/GameController';
import { TeacherHome } from './views/teacher/TeacherHome';
import { TeacherSession } from './views/teacher/TeacherSession';

initAuth();
initI18n();

const root = document.getElementById('app');

if (root) {
	m.route(root, '/', {
		'/': Home,
		'/join/:code': JoinSession,
		'/play/:id': GameController,
		'/teach': TeacherHome,
		'/teach/session/:id': TeacherSession,
	});
}
