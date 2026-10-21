import m from 'mithril';
import '@/styles/teacher.scss';
import { t } from '@/lib/i18n';
import { ensureUser } from '@/lib/user';
import { loadMainStatement, getMainStatement } from '@/lib/store';
import { checkAdminStatus, isAdmin } from '@/lib/admin';
import { ensureClassCode } from '@/lib/lesson';
import { QRShare } from '@/components/QRShare';
import { WizColFooter } from '@/components/WizColFooter';
import { readClassCode, studentJoinUrl } from './planHelpers';

/** Placeholder for the real console (a later step): shows where it will live,
 *  the way in for students, and the way to the plan. */

let ready = false;
let failed = false;
let loadedFor = '';

async function open(mid: string): Promise<void> {
	ready = false;
	failed = false;
	loadedFor = mid;
	m.redraw();
	try {
		await ensureUser();
		if (getMainStatement()?.statementId !== mid) await loadMainStatement(mid);
		const main = getMainStatement();
		if (!main || main.statementId !== mid) {
			failed = true;

			return;
		}
		await checkAdminStatus(mid, main.creatorId);
		if (!isAdmin()) {
			m.route.set(`/m/${mid}`);

			return;
		}
		// Admins get the join code on open (a no-op when it already exists);
		// the main statement listener-less read below then shows it.
		await ensureClassCode(mid).catch((err: unknown) => {
			console.error('[TeacherConsole] ensureClassCode failed:', err);
		});
		await loadMainStatement(mid);
	} catch (err) {
		console.error('[TeacherConsole] load failed:', err);
		failed = true;
	} finally {
		ready = true;
		m.redraw();
	}
}

export const TeacherConsole: m.Component = {
	oninit() {
		const mid = m.route.param('mid');
		if (!mid) {
			m.route.set('/t');

			return;
		}
		void open(mid);
	},

	view() {
		const mid = m.route.param('mid') ?? loadedFor;
		const main = getMainStatement();
		const code = ready && !failed ? readClassCode(main) : undefined;

		return m('.teacher-console', [
			m('header.teacher-console__header', [
				m(m.route.Link, { class: 'plan__back', href: '/t' }, [
					m('span.plan__back-chevron', { 'aria-hidden': 'true' }, '‹'),
					m('span', t('teacher.home.title')),
				]),
				m('h1.teacher-console__title', t('teacher.console.title')),
				ready && main ? m('p.plan__lesson', main.statement) : null,
			]),
			m('main.teacher-console__body', [
				!ready
					? m('.plan__skeleton', { 'aria-busy': 'true', 'aria-label': t('plan.loading') }, [
							m('.plan__skeleton-block.plan__skeleton-block--tall'),
						])
					: failed
						? m('p.plan__load-error', { role: 'alert' }, t('plan.error.load'))
						: [
								m('p.teacher-console__soon', t('teacher.console.soon')),
								code
									? m('p.teacher-console__code', [
											m('span.teacher-console__code-label', t('teacher.console.code')),
											m('strong.teacher-console__code-value', { dir: 'ltr' }, code),
										])
									: null,
								m('section.teacher-console__share', [
									m('h2.plan__section-title', t('teacher.console.share')),
									m(QRShare, {
										url: studentJoinUrl(window.location.origin, mid),
										title: main?.statement,
									}),
								]),
								m(
									m.route.Link,
									{ class: 'btn btn--primary teacher-console__plan', href: `/t/${mid}/plan` },
									t('teacher.row.plan'),
								),
							],
			]),
			m(WizColFooter),
		]);
	},
};
