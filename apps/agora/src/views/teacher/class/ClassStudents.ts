import m from 'mithril';
import { Icon } from '../../../components/Icon';
import { t } from '../../../lib/i18n';
import type { TeacherClassDetail } from '../../../lib/teacher';
import {
	arrangeStudents,
	memberInitial,
	pointsShare,
	STUDENT_SEARCH_FROM,
	type StudentSort,
} from '../../../lib/teacherHome';

export interface ClassStudentsAttrs {
	classId: string;
	detail: TeacherClassDetail;
}

/**
 * "Students": the roster, one row each — alias, lessons played, a meter and
 * points. A row opens that student's own page. Aliases only: real names, PINs
 * and the remove / reset actions live on the student page, never in a list.
 */
export function ClassStudents(): m.Component<ClassStudentsAttrs> {
	let query = '';
	let sort: StudentSort = 'name';

	return {
		view({ attrs }) {
			const { detail, classId } = attrs;
			if (detail.members.length === 0) {
				return m('.teach-empty', [
					m('strong.teach-empty__title', t('teach.no_students')),
					m('p', t('teach.no_students_hint', { code: detail.classCode })),
				]);
			}
			const entries = arrangeStudents(detail.members, detail.careers, { query, sort });
			const best = Math.max(0, ...entries.map((entry) => entry.career?.totals.total ?? 0));

			return [
				m('.find-bar', [
					detail.members.length > STUDENT_SEARCH_FROM
						? m('input.text-input.find-bar__input', {
								type: 'search',
								value: query,
								'aria-label': t('teach.search_students'),
								placeholder: t('teach.search_students'),
								oninput: (event: InputEvent) => {
									query = (event.target as HTMLInputElement).value;
								},
							})
						: null,
					m(
						'button.teach-link',
						{
							type: 'button',
							onclick: () => {
								sort = sort === 'name' ? 'points' : 'name';
							},
						},
						t(sort === 'name' ? 'teach.sort_by_name' : 'teach.sort_by_points'),
					),
				]),
				m(
					'ul.teach-list',
					{ role: 'list' },
					entries.map(({ member, career }) => {
						const played = career?.gamesPlayed ?? 0;
						const points = career?.totals.total ?? 0;

						return m('li', { key: member.memberId }, [
							m(
								m.route.Link,
								{
									href: `/teach/class/${classId}/student/${member.memberId}`,
									class: 'teach-row',
								},
								[
									m('span.avatar', { 'aria-hidden': 'true' }, memberInitial(member.alias)),
									m('span.teach-row__text', [
										m('span.teach-row__title', member.alias),
										m(
											'span.teach-row__meta',
											played > 0
												? t('roster.games', { count: String(played) })
												: t('teach.not_participated'),
										),
										m(
											'span.meter',
											{ 'aria-hidden': 'true' },
											m('span.meter__fill', {
												style: { inlineSize: `${pointsShare(points, best)}%` },
											}),
										),
									]),
									m('span.teach-row__end', String(points)),
									m('span.teach-row__go', m(Icon, { name: 'arrow', size: 18 })),
								],
							),
						]);
					}),
				),
			];
		},
	};
}
