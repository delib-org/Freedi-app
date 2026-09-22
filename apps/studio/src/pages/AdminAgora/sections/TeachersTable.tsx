import { Link } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';
import type { SupervisorTeacherRow } from '@freedi/shared-types';
import { EmptyState } from '@/components/atomic/atoms';
import { Sparkline } from '@/components/atomic/molecules/Chart';
import { shortDate } from './formatLesson';
import styles from '../AdminDetail.module.scss';

/** "Teachers' activity": name, classes, lessons/week, minutes/week, last active. */
export default function TeachersTable({
	rows,
	schoolId,
}: {
	rows: SupervisorTeacherRow[];
	schoolId: string;
}) {
	const { t, currentLanguage } = useTranslation();
	const sorted = [...rows].sort((a, b) => b.lastLessonAt - a.lastLessonAt);

	if (sorted.length === 0) return <EmptyState title={t('No activity yet')} compact />;

	return (
		<div className={styles.tableWrap}>
			<table className={styles.table}>
				<thead>
					<tr>
						<th scope="col">{t('Teacher')}</th>
						<th scope="col">{t('Classes')}</th>
						<th scope="col">{t('Lessons per week')}</th>
						<th scope="col">{t('Minutes per week')}</th>
						<th scope="col">{t('Last active')}</th>
					</tr>
				</thead>
				<tbody>
					{sorted.map((row) => (
						<tr key={row.uid}>
							<th scope="row">
								<Link to={`/admin/agora/teachers/${schoolId}/${row.uid}`}>{row.name}</Link>
							</th>
							<td className={styles.number}>{row.classCount}</td>
							<td>
								<Sparkline
									title={`${row.name}: ${t('Lessons per week')}`}
									keys={row.lessonsByWeek.map((p) => p.weekStart)}
									values={row.lessonsByWeek.map((p) => p.value)}
									slot={1}
									variant="bars"
								/>
							</td>
							<td>
								<Sparkline
									title={`${row.name}: ${t('Minutes per week')}`}
									keys={row.minutesByWeek.map((p) => p.weekStart)}
									values={row.minutesByWeek.map((p) => p.value)}
									slot={2}
								/>
							</td>
							<td>{shortDate(row.lastLessonAt, currentLanguage, t('Never'))}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
