import m from 'mithril';
import { IndicatorGrid } from '../../components/IndicatorGrid';
import { studentContextFrom } from '../../lib/indicatorContexts';
import { fetchSupervisorStudent } from '../../lib/supervisor';
import { t } from '../../lib/i18n';
import { cell, date, outcomePill, resource, section, shell } from './shared';

const LAST_GAMES = 10;

/** One student by alias: the career indicators and the last games */
export function SuperviseStudent(): m.Component<{ id: string }> {
	return resource<Awaited<ReturnType<typeof fetchSupervisorStudent>>, { id: string }>(
		(attrs) => fetchSupervisorStudent(attrs.id),
		(data) => {
			const ctx = studentContextFrom(data.career, data.classGames);
			const games = (ctx.career?.perGame ?? []).slice().reverse().slice(0, LAST_GAMES);
			const points = t('roster.points_label');
			const score = t('lesson.score');
			const outcome = t('lesson.outcome');

			return shell(
				data.alias,
				[
					m(IndicatorGrid<'student'>, { scope: 'student', context: ctx }),
					section(
						t('supervise.last_games'),
						games.length === 0
							? m('p.supervise__empty', t('indicator.empty.noGamesYet'))
							: m(
									'.supervise__table-wrap',
									m('table.supervise__table', [
										m(
											'thead',
											m(
												'tr',
												[t('lesson.date'), points, score, outcome].map((h) =>
													m('th', { scope: 'col' }, h),
												),
											),
										),
										m(
											'tbody',
											games.map((g) =>
												m('tr', { key: g.sessionId }, [
													m('th', { scope: 'row' }, date(g.playedAt)),
													cell(points, String(g.points.total)),
													cell(
														score,
														g.classScoreTotal === undefined ? '—' : String(g.classScoreTotal),
													),
													cell(outcome, outcomePill(g.outcome)),
												]),
											),
										),
									]),
								),
					),
				],
				{ subtitle: data.className, back: `/supervise/class/${data.classId}` },
			);
		},
		{ notFoundKey: 'supervise.student_not_found' },
	);
}
