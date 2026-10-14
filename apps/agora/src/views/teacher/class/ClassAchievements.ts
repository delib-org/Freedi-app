import m from 'mithril';
import { advancementSummary } from '@freedi/shared-types';
import { Icon } from '../../../components/Icon';
import { IndicatorGrid } from '../../../components/IndicatorGrid';
import { classContextFrom } from '../../../lib/indicatorContexts';
import { getLang, t } from '../../../lib/i18n';
import type { TeacherClassDetail } from '../../../lib/teacher';
import { bestClassLesson, classAverage, pointsShare } from '../../../lib/teacherHome';
import { getTopicPackage, loadTopicPackage } from '../../../lib/topic';

/** The tiles above print these three; the indicator grid below must not repeat them */
const CLASS_STATS_IN_TILES = ['class.lessons', 'class.avgScore', 'class.successRate'];
/**
 * The first chart, and the rest behind "more data". The contribution chart
 * is replaced by a bar list: nicknames along a phone-width axis overlap.
 */
const MAIN_CHART = 'class.scorePerLesson';
const HIDE_FROM_MAIN = [
	...CLASS_STATS_IN_TILES,
	'class.participation',
	'class.contributionByStudent',
	'class.pointsDistribution',
];
const HIDE_FROM_MORE = [...CLASS_STATS_IN_TILES, MAIN_CHART, 'class.contributionByStudent'];

function tile(value: string, label: string): m.Children {
	return m('.kpi', [m('span.kpi__number', value), m('span.kpi__label', label)]);
}

function bestLessonCard(detail: TeacherClassDetail): m.Children {
	const best = bestClassLesson(detail.aggregate);
	if (!best) return null;
	const topic = getTopicPackage(best.topicPackageId);
	if (!topic) loadTopicPackage(best.topicPackageId);
	const date = new Date(best.playedAt).toLocaleDateString(getLang(), {
		day: 'numeric',
		month: 'long',
	});

	return m('section.teach-card', [
		m('h3.teach-card__title', t('teach.best_lesson')),
		m(
			'span.teach-card__meta',
			[topic?.title, best.classScoreTotal, date]
				.filter((part) => part !== undefined && part !== '')
				.join(' · '),
		),
		m(
			m.route.Link,
			{ href: `/teach/report/${best.sessionId}`, class: 'teach-link' },
			t('teach.to_summary'),
			m(Icon, { name: 'arrow', size: 16 }),
		),
	]);
}

/** Contribution by student: one row per nickname, a meter and the points */
function contributionList(detail: TeacherClassDetail): m.Children {
	const rows = detail.members
		.map((member) => ({
			alias: member.alias,
			points: detail.careers.get(member.memberId)?.totals.total ?? 0,
		}))
		.sort((a, b) => b.points - a.points);
	const best = Math.max(0, ...rows.map((row) => row.points));

	return m('section.teach-card', [
		m('h3.teach-card__title', t('indicator.class.contributionByStudent')),
		m(
			'ul.teach-list',
			{ role: 'list' },
			rows.map((row) =>
				m('li.contrib-row', { key: row.alias }, [
					m('span.contrib-row__name', row.alias),
					m(
						'span.meter',
						{ 'aria-hidden': 'true' },
						m('span.meter__fill', { style: { inlineSize: `${pointsShare(row.points, best)}%` } }),
					),
					m('span.contrib-row__points', String(row.points)),
				]),
			),
		),
	]);
}

/**
 * "Achievements": the class's first section. Three numbers, then the class
 * indicators as the registry lays them out (never hand-drawn charts), then the
 * best lesson. Everything is read from the server-materialised aggregate.
 */
export function ClassAchievements(): m.Component<{ detail: TeacherClassDetail }> {
	let moreOpen = false;

	return {
		view({ attrs }) {
			const { detail } = attrs;
			const summary = detail.aggregate ? advancementSummary(detail.aggregate) : null;
			if (!summary || summary.gamesPlayed === 0) {
				return m('.teach-empty', [m('p', t('teach.achievements_empty'))]);
			}
			const average = classAverage(detail.aggregate);
			const took = [...detail.careers.values()].filter((career) => career.gamesPlayed > 0).length;

			return [
				m('.kpis', [
					tile(average === null ? '—' : String(average), t('teach.kpi_avg')),
					tile(String(summary.gamesPlayed), t('teach.kpi_lessons')),
					tile(String(took), t('teach.kpi_active')),
				]),
				m(IndicatorGrid<'class'>, {
					scope: 'class',
					context: classContextFrom(detail),
					options: { hide: HIDE_FROM_MAIN },
				}),
				bestLessonCard(detail),
				m(
					'button.teach-link',
					{
						type: 'button',
						'aria-expanded': String(moreOpen),
						'aria-controls': 'class-more-data',
						onclick: () => {
							moreOpen = !moreOpen;
						},
					},
					t('teach.more_data'),
				),
				moreOpen
					? m('#class-more-data.teach-section', [
							contributionList(detail),
							m(IndicatorGrid<'class'>, {
								scope: 'class',
								context: classContextFrom(detail),
								options: { hide: HIDE_FROM_MORE },
							}),
						])
					: null,
			];
		},
	};
}
