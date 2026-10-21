// Route /t/:mid/table/:n. Placeholder owned by lane C4 (replace the body, keep the export).
import m from 'mithril';
import '@/styles/teacher.scss';
import { t } from '@/lib/i18n';

export const TableSheet: m.Component = {
	view() {
		const mid = m.route.param('mid') ?? '';
		const n = m.route.param('n') ?? '';

		return m('.teacher-console', [
			m('header.teacher-console__header', [
				m(m.route.Link, { class: 'plan__back', href: `/t/${mid}` }, [
					m('span.plan__back-chevron', { 'aria-hidden': 'true' }, '‹'),
					m('span', t('teacher.console.title')),
				]),
				m('h1.teacher-console__title', `#${n}`),
			]),
		]);
	},
};
