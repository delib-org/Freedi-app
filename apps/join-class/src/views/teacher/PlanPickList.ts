import m from 'mithril';
import { t } from '@/lib/i18n';
import type { CopySource } from '@/lib/planTree';
import { pickRow } from './HomeCreate';
import { filterLessons } from './homeHelpers';

/**
 * The "questions from another game" list of the plan screen: every game (and old lesson) of the
 * teacher's plans, grouped by plan, with a name filter from FILTER_FROM rows.
 */

const FILTER_FROM = 10;

export type SourcesLoad = 'idle' | 'loading' | 'ready' | 'error';

export interface PlanPickListAttrs {
	sources: readonly CopySource[];
	load: SourcesLoad;
	/** The read failed: try again. */
	onRetry: () => void;
}

let pickFilter = '';

function renderRow(s: CopySource): m.Vnode {
	return m('li.teacher-home__row', { key: s.id }, [
		m('h3.teacher-home__row-title', { dir: 'auto' }, s.title),
		m('.teacher-home__row-actions', [
			m(
				'button.btn.btn--primary.btn--small',
				{
					type: 'button',
					'data-action': 'pick',
					'data-id': s.id,
					'aria-label': t('teacher.row.for', { action: t('teacher.row.pick'), name: s.title }),
					onclick: () => pickRow(s.id, s.title),
				},
				t('teacher.row.pick'),
			),
		]),
	]);
}

export function renderPickList({ sources, load, onRetry }: PlanPickListAttrs): m.Children {
	if (load === 'loading' || load === 'idle') {
		return m('.teacher-home__skeleton', { 'aria-busy': 'true', 'aria-label': t('plan.loading') });
	}
	if (load === 'error') {
		return m('.teacher-home__error', { role: 'alert' }, [
			m('span', t('teacher.copy.failed')),
			m(
				'button.btn.btn--tertiary.btn--small',
				{ type: 'button', onclick: onRetry },
				t('plan.error.retry'),
			),
		]);
	}
	const filtering = sources.length > FILTER_FROM;
	const shown = filtering ? filterLessons(sources, pickFilter) : sources;
	const planIds = [...new Set(shown.map((s) => s.planId))];

	return [
		filtering
			? m('input.teacher-home__filter', {
					type: 'search',
					value: pickFilter,
					placeholder: t('teacher.home.filter'),
					'aria-label': t('teacher.home.filter'),
					oninput: (e: Event) => {
						pickFilter = (e.target as HTMLInputElement).value;
					},
				})
			: null,
		m(
			'.plan-overview__pick-groups',
			planIds.map((id) => {
				const group = shown.filter((s) => s.planId === id);

				return m('section.plan-overview__pick-group', { key: id }, [
					m('h2.teacher-home__section-title', { dir: 'auto' }, group[0].planTitle),
					m('ul.teacher-home__list', { 'aria-labelledby': 'pick-lead' }, group.map(renderRow)),
				]);
			}),
		),
	];
}
