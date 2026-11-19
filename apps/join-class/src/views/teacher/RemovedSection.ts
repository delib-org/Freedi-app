import m from 'mithril';
import { t } from '@/lib/i18n';
import { planPathOf } from '@/lib/lessonLinks';
import { removedCount, type RemovedItems } from '@/lib/removedItems';
import { filterLessons } from './homeHelpers';
import { PLAN_FILTER_FROM } from './lessonPickerFlow';
import { givenNameOf, renderLessonName } from './LessonRow';
import { renderRestore } from './RemoveControl';

/**
 * "הוסרו (N)": the one home of everything the teacher removed (docs/ia/join-class-remove-lessons.md
 * 4, 5, 8). A collapsed disclosure at the bottom of the home, shown only when something is
 * removed. Three fixed groups (plans, games, lessons), most recently removed first, each row
 * with "החזרה".
 */

let filterText = '';

/** Forget the filter when the home opens again. */
export function resetRemovedSection(): void {
	filterText = '';
}

function renderFilter(): m.Children {
	return m('input.teacher-home__filter', {
		type: 'search',
		value: filterText,
		placeholder: t('teacher.home.filter'),
		'aria-label': t('teacher.home.filter'),
		oninput: (e: Event) => {
			filterText = (e.target as HTMLInputElement).value;
		},
	});
}

function renderGroup(titleKey: string, rows: m.Vnode[]): m.Children {
	if (rows.length === 0) return null;

	return m('section', { 'aria-label': t(titleKey) }, [
		m('h3.teacher-home__removed-group-title', t(titleKey)),
		m('ul.teacher-home__list', rows),
	]);
}

export function renderRemovedSection(items: RemovedItems): m.Children {
	const total = removedCount(items);
	if (total === 0) return null;
	const filtering = total > PLAN_FILTER_FROM;
	const keep = <T extends { title: string }>(list: readonly T[]): T[] =>
		filtering ? filterLessons(list, filterText) : [...list];

	const plans = keep(items.plans).map((p) =>
		m('li.teacher-home__row', { key: p.planId, 'data-removed-plan': p.planId }, [
			m(
				'h4.teacher-home__row-title',
				{ dir: 'auto' },
				m(
					m.route.Link,
					{
						class: 'teacher-home__row-link',
						href: planPathOf(p.planId),
						'data-action': 'plan-open',
					},
					p.title,
				),
			),
			m('.teacher-home__row-actions', renderRestore({ kind: 'plan', planId: p.planId }, p.title)),
		]),
	);
	const games = keep(items.games).map((g) =>
		m('li.teacher-home__row', { key: g.gameId, 'data-removed-game': g.gameId }, [
			m('h4.teacher-home__row-title', { dir: 'auto' }, g.title),
			m('p.teacher-home__removed-context', { dir: 'auto' }, g.planTitle),
			m(
				'.teacher-home__row-actions',
				renderRestore({ kind: 'game', planId: g.planId, gameId: g.gameId }, g.title),
			),
		]),
	);
	const lessons = items.lessons
		.filter((l) => keep([{ title: `${l.planTitle} ${l.gameTitle}` }]).length > 0)
		.map((l) =>
			m('li.teacher-home__row', { key: l.entry.id, 'data-removed-lesson': l.entry.id }, [
				m('h4.teacher-home__row-title', { dir: 'auto' }, renderLessonName(l.entry)),
				m('p.teacher-home__removed-context', { dir: 'auto' }, `${l.planTitle} · ${l.gameTitle}`),
				m(
					'.teacher-home__row-actions',
					renderRestore(
						{ kind: 'lesson', mainId: l.entry.id },
						givenNameOf(l.entry) || l.gameTitle,
					),
				),
			]),
		);

	return m('details.teacher-home__removed', { 'data-testid': 'removed' }, [
		m('summary.teacher-home__removed-summary', t('teacher.home.removed', { n: total })),
		filtering ? renderFilter() : null,
		renderGroup('teacher.home.removed_plans', plans),
		renderGroup('teacher.home.removed_games', games),
		renderGroup('teacher.home.removed_lessons', lessons),
	]);
}
