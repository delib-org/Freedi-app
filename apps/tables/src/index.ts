import m from 'mithril';
import './styles/app.scss';
import { startA11yPrefs } from '@/lib/a11yPrefs';
import { initSentry } from '@/lib/sentry';
import { initI18n } from '@/lib/i18n';
import { mountRouter } from '@/router';

initSentry();
startA11yPrefs(() => m.redraw());

const root = document.getElementById('app');

if (root) {
	// Wait for the dictionary so the first paint is already in the right language and direction.
	void initI18n().then(() => {
		mountRouter(root);
	});
}
