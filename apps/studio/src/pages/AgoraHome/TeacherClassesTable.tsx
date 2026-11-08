import { Link } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';
import type { AgoraClassAggregate, TeacherConsoleDashboard } from '@freedi/shared-types';
import { EmptyState } from '@/components/atomic/atoms';
import { PERSONAL_AGORA_BASE } from '../AdminAgora/agoraBase';
import styles from '../AdminAgora/AdminDetail.module.scss';

export interface TeacherClassesTableProps {
	classes: TeacherConsoleDashboard['classes'];
	/** classId → its aggregate (JSON), when one exists. */
	aggregates: TeacherConsoleDashboard['aggregates'];
}

/** A teacher's own classes: each row opens the class page under `/agora`. */
export default function TeacherClassesTable({ classes, aggregates }: TeacherClassesTableProps) {
	const { t, currentLanguage } = useTranslation();
	const sorted = [...classes].sort((a, b) => a.name.localeCompare(b.name, currentLanguage));

	if (sorted.length === 0) return <EmptyState title={t('No classes yet')} compact />;

	return (
		<div className={styles.tableWrap}>
			<table className={styles.table}>
				<thead>
					<tr>
						<th scope="col">{t('Class')}</th>
						<th scope="col">{t('Students')}</th>
						<th scope="col">{t('Lessons')}</th>
					</tr>
				</thead>
				<tbody>
					{sorted.map((row) => {
						const aggregate = aggregates[row.classId] as AgoraClassAggregate | undefined;

						return (
							<tr key={row.classId}>
								<th scope="row">
									<Link to={`${PERSONAL_AGORA_BASE}/classes/${row.classId}`}>
										{row.name}
										{row.gradeLevel ? ` · ${row.gradeLevel}` : ''}
									</Link>
								</th>
								<td className={styles.number}>{row.memberCount}</td>
								<td className={styles.number}>{aggregate?.gamesPlayed ?? 0}</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
