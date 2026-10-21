import m from 'mithril';
import '@/styles/teacher.scss';
import { t } from '@/lib/i18n';

/** Placeholder for the projector screen (a later step). */
export const TeacherProjector: m.Component = {
	view() {
		const mid = m.route.param('mid') ?? '';

		return m('.teacher-console', [
			m('header.teacher-console__header', [
				m(m.route.Link, { class: 'plan__back', href: `/t/${mid}` }, [
					m('span.plan__back-chevron', { 'aria-hidden': 'true' }, '‹'),
					m('span', t('teacher.console.title')),
				]),
				m('h1.teacher-console__title', t('teacher.screen.title')),
			]),
			m('main.teacher-console__body', [m('p.teacher-console__soon', t('teacher.screen.soon'))]),
		]);
	},
};
