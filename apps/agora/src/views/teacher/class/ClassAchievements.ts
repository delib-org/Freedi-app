import m from 'mithril';
import { advancementSummary } from '@freedi/shared-types';
import { Icon } from '../../../components/Icon';
import { IndicatorGrid } from '../../../components/IndicatorGrid';
import { classContextFrom } from '../../../lib/indicatorContexts';
import { getLang, t } from '../../../lib/i18n';
import type { TeacherClassDetail } from '../../../lib/teacher';
import { bestClassLesson, classAverage } from '../../../lib/teacherHome';
import { getTopicPackage, loadTopicPackage } from '../../../lib/topic';

/** The tiles above print these three; the indicator grid below must not repeat them */
const CLASS_STATS_IN_TILES = ['class.lessons', 'class.avgScore', 'class.successRate'];

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

/**
 * "Achievements": the class's first section. Three numbers, then the class
 * indicators as the registry lays them out (never hand-drawn charts), then the
 * best lesson. Everything is read from the server-materialised aggregate.
 */
export const ClassAchievements: m.Component<{ detail: TeacherClassDetail }> = {
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
				options: { hide: CLASS_STATS_IN_TILES },
			}),
			bestLessonCard(detail),
		];
	},
};
