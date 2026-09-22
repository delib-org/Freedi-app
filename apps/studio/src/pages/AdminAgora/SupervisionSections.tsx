import { Link } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';
import { parse } from 'valibot';
import {
	AgoraClassAggregateSchema,
	type SupervisorClassRow,
	type SupervisorTeacherRow,
	type AgoraTeacherLessonRow,
} from '@freedi/shared-types';
import { Button } from '@/components/atomic/atoms';
import Chart from '@/components/atomic/molecules/Chart/Chart';
import IndicatorGrid from '@/components/atomic/molecules/Chart/IndicatorGrid';
import styles from './Supervision.module.scss';

export function PeriodPicker({ days, onChange }: { days: number; onChange: (n: number) => void }) {
	const { t } = useTranslation();

	return (
		<div className={styles.controls}>
			{[30, 90].map((n) => (
				<Button
					key={n}
					text={t(n === 30 ? 'Last 30 days' : 'Last 90 days')}
					variant={n === days ? 'primary' : 'secondary'}
					onClick={() => onChange(n)}
				/>
			))}
		</div>
	);
}
export function PrivacyNote() {
	const { t } = useTranslation();

	return (
		<p className={styles.notice}>
			{t(
				'Active time counts visible teacher and supervision screens after interaction. Daily totals only; no page URLs or keystrokes are recorded.',
			)}
		</p>
	);
}
export function TeacherRows({
	rows,
	schoolId,
}: {
	rows: SupervisorTeacherRow[];
	schoolId: string;
}) {
	const { t, currentLanguage } = useTranslation();

	return (
		<div className={styles.tableWrap}>
			<table className={styles.table}>
				<thead>
					<tr>
						{['Teacher', 'Lessons per week', 'Active minutes per week', 'Last lesson'].map((k) => (
							<th key={k} scope="col">
								{t(k)}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((r) => (
						<tr key={r.uid}>
							<th scope="row">
								<Link
									to={`/admin/agora/teachers/${r.uid}?schoolId=${encodeURIComponent(schoolId)}`}
								>
									{r.name}
								</Link>
							</th>
							{[r.lessonsByWeek, r.minutesByWeek].map((points, i) => (
								<td key={i} className={styles.spark}>
									<Chart
										compact
										title={t(i ? 'Active minutes per week' : 'Lessons per week')}
										spec={{
											kind: 'sparkline',
											keys: points.map((p) => p.weekStart),
											values: points.map((p) => p.value),
											slot: i ? 2 : 1,
										}}
									/>
								</td>
							))}
							<td>
								{r.lastLessonAt
									? new Date(r.lastLessonAt).toLocaleDateString(currentLanguage)
									: '—'}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
export function ClassCards({ rows }: { rows: SupervisorClassRow[] }) {
	return (
		<div className={styles.cards}>
			{rows.map((c) => (
				<section className={styles.card} key={c.classId}>
					<h3>
						<Link to={`/admin/agora/classes/${c.classId}`}>{c.name}</Link>
					</h3>
					<IndicatorGrid
						scope="class"
						chartsOnly
						options={{ hide: ['class.contributionByStudent', 'class.pointsDistribution'] }}
						context={{
							aggregate: c.aggregate ? parse(AgoraClassAggregateSchema, c.aggregate) : null,
							members: [],
							careers: {},
							memberCount: c.memberCount,
						}}
					/>
				</section>
			))}
		</div>
	);
}
export function LessonsTable({ rows }: { rows: AgoraTeacherLessonRow[] }) {
	const { t, currentLanguage } = useTranslation();

	return (
		<div className={styles.tableWrap}>
			<table className={styles.table}>
				<thead>
					<tr>
						{['Date', 'Duration (minutes)', 'Participants', 'Class score'].map((k) => (
							<th scope="col" key={k}>
								{t(k)}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((r) => (
						<tr key={r.sessionId}>
							<th scope="row">{new Date(r.playedAt).toLocaleDateString(currentLanguage)}</th>
							<td>{Math.round(r.durationMs / 60000)}</td>
							<td>{r.participantCount}</td>
							<td>{r.classScoreTotal ?? '—'}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
