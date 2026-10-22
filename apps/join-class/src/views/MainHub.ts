import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import { ensureUser } from '@/lib/user';
import {
	loadMainStatement,
	getMainStatement,
	subscribeMainStatement,
	subscribeSubQuestions,
	setFollowLessonLanguage,
} from '@/lib/store';
import { checkAdminStatus, isAdmin } from '@/lib/admin';
import { t } from '@/lib/i18n';
import { SplashLoader } from '@/views/Splash';
import { StudentStage } from '@/views/student/StudentStage';
import { useStudentStage } from '@/views/student/useStudentStage';
import { BrandLogo } from '@/components/BrandLogo';
import type { Unsubscribe } from '@/lib/firebase';

/**
 * `/m/:mid` - the lesson, student side. Only a loader: it fetches the main
 * statement, sends the lesson's teacher to the console (`/t/:mid`, unless
 * `?student=1`), shows "not a lesson" for any other statement, and otherwise
 * renders the student stage.
 */

let loading = true;
let failed = false;
let mainUnsub: Unsubscribe | null = null;
let subUnsub: Unsubscribe | null = null;

function teardown(): void {
	if (mainUnsub) {
		mainUnsub();
		mainUnsub = null;
	}
	if (subUnsub) {
		subUnsub();
		subUnsub = null;
	}
}

/** The lesson's own teacher belongs on the console, unless previewing as a student. */
function sendsToConsole(main: Statement): boolean {
	return (
		isAdmin() && m.route.param('student') !== '1' && Boolean(main.statementSettings?.lessonPlan)
	);
}

function notALesson(): m.Vnode {
	return m('main.door', [
		m('header.door__header', m(BrandLogo, { size: 48, className: 'door__logo' })),
		m('h1.door__title', { tabindex: '-1', oncreate: focusHeading }, t('lesson.not_lesson')),
		m(m.route.Link, { class: 'btn btn--primary door__enter', href: '/' }, t('login.have_code')),
	]);
}

function focusHeading(vnode: m.VnodeDOM): void {
	(vnode.dom as HTMLElement).focus();
}

export const MainHub: m.Component = {
	async oninit() {
		setFollowLessonLanguage(true);
		failed = false;
		const mainId = m.route.param('mid');
		if (!mainId) {
			loading = false;
			m.route.set('/', undefined, { replace: true });

			return;
		}
		// A repeat visit finds the same statement in the store: render at once and
		// re-attach the listeners behind it.
		loading = getMainStatement()?.statementId !== mainId;
		if (!loading) m.redraw();
		try {
			await ensureUser();
			if (loading) await loadMainStatement(mainId);
			const main = getMainStatement();
			if (main) await checkAdminStatus(mainId, main.creatorId);
			if (main && sendsToConsole(main)) {
				m.route.set(`/t/${mainId}`, undefined, { replace: true });

				return;
			}
			teardown();
			mainUnsub = subscribeMainStatement(mainId);
			subUnsub = subscribeSubQuestions(mainId);
		} catch (err) {
			console.error('[MainHub] Failed to load:', err);
			failed = true;
		} finally {
			loading = false;
			m.redraw();
		}
	},

	onremove() {
		teardown();
	},

	view() {
		if (loading) return m(SplashLoader);
		if (failed) return m('.main-hub', m('.main-hub__empty', t('solutions.error.failed')));

		const main = getMainStatement();
		if (!main?.statementSettings?.lessonPlan) return notALesson();

		if (sendsToConsole(main)) return m(SplashLoader);
		if (useStudentStage(main, isAdmin(), m.route.param('student'))) {
			return m(StudentStage, { main, key: main.statementId });
		}

		return notALesson();
	},
};
