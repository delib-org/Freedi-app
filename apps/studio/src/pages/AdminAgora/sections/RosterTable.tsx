import { Link } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';
import type { AgoraStudentAggregate, TeacherConsoleMember } from '@freedi/shared-types';
import { EmptyState } from '@/components/atomic/atoms';
import { shortDate } from './formatLesson';
import styles from '../AdminDetail.module.scss';

export interface RosterTableProps {
	members: TeacherConsoleMember[];
	/** memberId → career; a member without one has not played yet. */
	careers: Record<string, AgoraStudentAggregate>;
}

/** The class roster: alias, games, points, last active — each row opens the student page. */
export default function RosterTable({ members, careers }: RosterTableProps) {
	const { t, currentLanguage } = useTranslation();
	const sorted = [...members].sort((a, b) => a.alias.localeCompare(b.alias, currentLanguage));

	if (sorted.length === 0) return <EmptyState title={t('No students yet')} compact />;

	return (
		<div className={styles.tableWrap}>
			<table className={styles.table}>
				<thead>
					<tr>
						<th scope="col">{t('Student')}</th>
						<th scope="col">{t('Games')}</th>
						<th scope="col">{t('Points')}</th>
						<th scope="col">{t('Last active')}</th>
					</tr>
				</thead>
				<tbody>
					{sorted.map((member) => {
						const career = careers[member.memberId];

						return (
							<tr key={member.memberId}>
								<th scope="row">
									<Link to={`/admin/agora/students/${member.memberId}`}>{member.alias}</Link>
								</th>
								<td className={styles.number}>{career?.gamesPlayed ?? 0}</td>
								<td className={styles.number}>{career?.totals.total ?? 0}</td>
								<td>{shortDate(member.lastActive, currentLanguage, t('Never'))}</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
