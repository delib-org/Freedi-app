import m from 'mithril';
import '@/styles/student-screen-sample.scss';
import { t } from '@/lib/i18n';
import { captureException } from '@/lib/sentry';

/**
 * The "Student screen" view as its own lazy chunk: a teacher who never opens it
 * never downloads the student screens into the console. While the chunk loads the
 * empty phone shows; a failed load is retried on the next open.
 */

let loaded: m.ComponentTypes | null = null;
let loading: Promise<void> | null = null;

function load(): Promise<void> {
	loading ??= import('./StudentScreenSample')
		.then((mod) => {
			loaded = mod.StudentScreenSample;
		})
		.catch((error: unknown) => {
			console.error('[StudentScreen] loading the sample failed:', error);
			captureException(error, { operation: 'studentScreen.load' });
			loading = null;
		});

	return loading;
}

export const LazyStudentScreen: m.Component = {
	oninit() {
		void load().then(() => m.redraw());
	},

	view() {
		if (loaded) return m(loaded);

		return m('section.student-screen', { 'aria-busy': 'true' }, [
			m('div.student-screen__phone', { role: 'group', 'aria-label': t('console.student_screen') }),
			m('p.student-screen__note', t('console.student_screen_note')),
		]);
	},
};
