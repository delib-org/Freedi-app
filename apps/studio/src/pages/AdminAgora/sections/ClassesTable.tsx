import { Link } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';
import { dayKey } from '@freedi/shared-charts';
import type { SupervisorClassRow } from '@freedi/shared-types';
import { EmptyState } from '@/components/atomic/atoms';
import { Sparkline } from '@/components/atomic/molecules/Chart';
import { classRowContextFrom } from '@/lib/indicatorContexts';
import { shortDate } from './formatLesson';
import styles from '../AdminDetail.module.scss';

/** A teacher's (or school's) classes: size, lessons, score trend, participation trend. */
export default function ClassesTable({ rows }: { rows: SupervisorClassRow[] }) {
	const { t, currentLanguage } = useTranslation();
	const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name, currentLanguage));

	if (sorted.length === 0) return <EmptyState title={t('No classes yet')} compact />;

	return (
		<div className={styles.tableWrap}>
			<table className={styles.table}>
				<thead>
					<tr>
						<th scope="col">{t('Class')}</th>
						<th scope="col">{t('Students')}</th>
						<th scope="col">{t('Lessons')}</th>
						<th scope="col">{t('Average class score')}</th>
						<th scope="col">{t('Score per lesson')}</th>
						<th scope="col">{t('Participation')}</th>
						<th scope="col">{t('Last lesson')}</th>
					</tr>
				</thead>
				<tbody>
					{sorted.map((row) => {
						const games = classRowContextFrom(row).aggregate?.perGame ?? [];
						const scored = games.filter((g) => typeof g.classScoreTotal === 'number');
						const keys = games.map((g) => dayKey(g.playedAt));

						return (
							<tr key={row.classId}>
								<th scope="row">
									<Link to={`/admin/agora/classes/${row.classId}`}>
										{row.name}
										{row.gradeLevel ? ` · ${row.gradeLevel}` : ''}
									</Link>
								</th>
								<td className={styles.number}>{row.memberCount}</td>
								<td className={styles.number}>{row.advancement?.gamesPlayed ?? 0}</td>
								<td className={styles.number}>{row.advancement?.avgClassScore ?? '—'}</td>
								<td>
									{scored.length > 0 ? (
										<Sparkline
											title={`${row.name}: ${t('Score per lesson')}`}
											keys={scored.map((g) => dayKey(g.playedAt))}
											values={scored.map((g) => g.classScoreTotal ?? 0)}
											slot={1}
										/>
									) : (
										'—'
									)}
								</td>
								<td>
									{games.length > 0 ? (
										<Sparkline
											title={`${row.name}: ${t('Participation')}`}
											keys={keys}
											values={games.map((g) => g.participantCount)}
											slot={2}
											variant="bars"
										/>
									) : (
										'—'
									)}
								</td>
								<td>{shortDate(row.advancement?.lastPlayedAt, currentLanguage, t('Never'))}</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
