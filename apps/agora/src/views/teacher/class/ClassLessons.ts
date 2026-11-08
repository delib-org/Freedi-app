import m from 'mithril';
import { AgoraSession } from '@freedi/shared-types';
import { Icon } from '../../../components/Icon';
import { lessonDate, lessonTitle, monthLabel } from '../../../lib/lessonLabels';
import { t } from '../../../lib/i18n';
import { groupByMonth } from '../../../lib/teacherHome';

/**
 * One lesson as a row: its scenario, its date, and how it went. A finished
 * lesson opens its summary; a live one opens the console.
 */
export function lessonRow(session: AgoraSession, live: boolean, className?: string): m.Children {
	const title = lessonTitle(session) ?? '';

	return m(
		m.route.Link,
		{
			key: session.sessionId,
			href: live ? `/teach/session/${session.sessionId}` : `/teach/report/${session.sessionId}`,
			class: 'teach-row',
		},
		[
			m('span.teach-row__text', [
				m('span.teach-row__title', title || lessonDate(session.createdAt)),
				m(
					'span.teach-row__meta',
					[className, title ? lessonDate(session.createdAt) : undefined]
						.filter(Boolean)
						.join(' · '),
				),
			]),
			live
				? m('span.teach-row__live', t('dashboard.game_live'))
				: session.classScore
					? m('span.teach-row__end', String(session.classScore.total))
					: m('span.teach-row__unscored', t('teach.unscored')),
			m('span.teach-row__go', m(Icon, { name: 'arrow', size: 18 })),
		],
	);
}

/** Lessons folded into their months, newest first — shared by a class and by the past-lessons page */
export function monthGroups(
	sessions: readonly AgoraSession[],
	isLive: (session: AgoraSession) => boolean,
	className?: (session: AgoraSession) => string | undefined,
): m.Children {
	return groupByMonth(sessions, (session) => session.createdAt, monthLabel).map((group) =>
		m('section.teach-section', { key: group.key, 'aria-label': group.label }, [
			m('h3.month-label', group.label),
			m(
				'ul.teach-list',
				{ role: 'list' },
				group.items.map((session) =>
					m(
						'li',
						{ key: session.sessionId },
						lessonRow(session, isLive(session), className?.(session)),
					),
				),
			),
		]),
	);
}
