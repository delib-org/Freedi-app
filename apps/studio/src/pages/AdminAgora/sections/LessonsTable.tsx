import { Link } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';
import type { AgoraSessionOutcome } from '@freedi/shared-types';
import { EmptyState } from '@/components/atomic/atoms';
import OutcomeTag from './OutcomeTag';
import { lessonDuration, shortDate } from './formatLesson';
import styles from '../AdminDetail.module.scss';

/** The columns every lesson row has, whichever callable it came from. */
export interface LessonLike {
	sessionId: string;
	playedAt: number;
	durationMs: number;
	participantCount: number;
	classScoreTotal?: number;
	outcome?: AgoraSessionOutcome | string;
	classId?: string;
}

export interface LessonsTableProps {
	rows: LessonLike[];
	/** classId → name; when given, a Class column links to each class page. */
	classNames?: Map<string, string>;
}

/** Newest first: date, class, duration, participants, score, outcome. */
export default function LessonsTable({ rows, classNames }: LessonsTableProps) {
	const { t, tWithParams, currentLanguage } = useTranslation();
	const sorted = [...rows].sort((a, b) => b.playedAt - a.playedAt);

	if (sorted.length === 0) return <EmptyState title={t('No lessons yet')} compact />;

	return (
		<div className={styles.tableWrap}>
			<table className={styles.table}>
				<thead>
					<tr>
						<th scope="col">{t('Date')}</th>
						{classNames && <th scope="col">{t('Class')}</th>}
						<th scope="col">{t('Duration')}</th>
						<th scope="col">{t('Participants')}</th>
						<th scope="col">{t('Score')}</th>
						<th scope="col">{t('Outcome')}</th>
					</tr>
				</thead>
				<tbody>
					{sorted.map((row) => (
						<tr key={row.sessionId}>
							<th scope="row">{shortDate(row.playedAt, currentLanguage, '—')}</th>
							{classNames && (
								<td>
									{row.classId ? (
										<Link to={`/admin/agora/classes/${row.classId}`}>
											{classNames.get(row.classId) ?? t('Class')}
										</Link>
									) : (
										'—'
									)}
								</td>
							)}
							<td>{lessonDuration(row.durationMs, tWithParams)}</td>
							<td className={styles.number}>{row.participantCount}</td>
							<td className={styles.number}>{row.classScoreTotal ?? '—'}</td>
							<td>
								<OutcomeTag outcome={row.outcome} />
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
