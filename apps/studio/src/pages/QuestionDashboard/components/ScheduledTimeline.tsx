import { useMemo, useState, type FC } from 'react';
import clsx from 'clsx';
import type { ScheduledAction, ScheduledActionStatus } from '@freedi/shared-types';
import type { DerivedActivity } from '@freedi/event-core';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Button } from '@/components/atomic/atoms/Button';
import { EmptyState } from '@/components/atomic/atoms/EmptyState';
import { ACTION_GLYPHS, ACTION_LABELS, Tag } from '@/components/atomic/atoms/Tag';
import { scheduledActionCancel } from '@/db/orgFunctions';
import { splitScheduled } from '@/db/scheduledActions';
import { formatRelativeTime, useNowTick } from '@/hooks/useRelativeTime';
import { formatDateTime, toIsoDateTime } from '@/utils/formatDateTime';
import ConfirmDialog from './ConfirmDialog';

/**
 * ScheduledTimeline — what will happen to this question and when: upcoming
 * (pending) actions first, past ones collapsed. Managers can edit or cancel
 * a pending action. Styles: styles/molecules/_timeline.scss (.timeline)
 */
export interface ScheduledTimelineProps {
	actions: ScheduledAction[];
	activities: DerivedActivity[];
	/** The top question — the target when an action addresses it directly. */
	questionId: string;
	questionTitle: string;
	canManage: boolean;
	onSelectActivity: (statementId: string) => void;
	onEdit: (action: ScheduledAction) => void;
	onPlanWithAI: () => void;
	className?: string;
}

const STATUS_LABELS: Record<ScheduledActionStatus, string> = {
	pending: 'Pending',
	running: 'Running',
	done: 'Done',
	failed: 'Failed',
	cancelled: 'Cancelled',
};

const ScheduledTimeline: FC<ScheduledTimelineProps> = ({
	actions,
	activities,
	questionId,
	questionTitle,
	canManage,
	onSelectActivity,
	onEdit,
	onPlanWithAI,
	className,
}) => {
	const { t, tWithParams, currentLanguage } = useTranslation();
	const now = useNowTick();
	const [cancelling, setCancelling] = useState<ScheduledAction | null>(null);

	const { upcoming, past } = useMemo(() => splitScheduled(actions), [actions]);

	const targetOf = (action: ScheduledAction): { title: string; activityId?: string } => {
		if (action.statementId === questionId) return { title: questionTitle || t('Main question') };
		const activity = activities.find((a) => a.statementId === action.statementId);

		return activity
			? { title: activity.title || t('Untitled'), activityId: activity.statementId }
			: { title: t('Untitled') };
	};

	const handleCancel = async () => {
		if (!cancelling) return;
		await scheduledActionCancel({ scheduledActionId: cancelling.scheduledActionId });
		setCancelling(null);
	};

	const renderItem = (action: ScheduledAction, isPast: boolean) => {
		const target = targetOf(action);
		const editable = canManage && action.status === 'pending';

		return (
			<li
				key={action.scheduledActionId}
				className={clsx(
					'timeline__item',
					`timeline__item--${action.action}`,
					isPast && 'timeline__item--past',
				)}
			>
				<span className="timeline__kind">
					<span className="timeline__glyph" aria-hidden="true">
						{ACTION_GLYPHS[action.action]}
					</span>
					{t(ACTION_LABELS[action.action])}
				</span>
				<span className="timeline__target">
					{target.activityId ? (
						<button
							type="button"
							className="timeline__target-button"
							dir="auto"
							onClick={() => onSelectActivity(target.activityId as string)}
						>
							{target.title}
						</button>
					) : (
						<span dir="auto">{target.title}</span>
					)}
					{action.status !== 'pending' && (
						<Tag
							outline={action.status === 'cancelled'}
							className={`timeline__status timeline__status--${action.status}`}
						>
							{t(STATUS_LABELS[action.status])}
						</Tag>
					)}
				</span>
				<time className="timeline__time" dateTime={toIsoDateTime(action.runAt)}>
					{formatDateTime(action.runAt, currentLanguage)} ·{' '}
					{formatRelativeTime(action.runAt, currentLanguage, { now })}
				</time>
				{action.action === 'nudge' && action.nudge?.message && (
					<p className="timeline__nudge" dir="auto">
						{action.nudge.message}
					</p>
				)}
				{action.status === 'failed' && action.error && (
					<p className="timeline__error" dir="auto">
						{action.error}
					</p>
				)}
				{editable && (
					<div className="timeline__actions">
						<Button
							text={t('Edit')}
							variant="secondary"
							size="small"
							ariaLabel={tWithParams('Edit: {{action}} {{target}}', {
								action: t(ACTION_LABELS[action.action]),
								target: target.title,
							})}
							onClick={() => onEdit(action)}
						/>
						<Button
							text={t('Cancel')}
							variant="secondary"
							size="small"
							ariaLabel={tWithParams('Cancel: {{action}} {{target}}', {
								action: t(ACTION_LABELS[action.action]),
								target: target.title,
							})}
							onClick={() => setCancelling(action)}
						/>
					</div>
				)}
			</li>
		);
	};

	return (
		<section className={clsx('timeline', className)} aria-label={t('Scheduled actions')}>
			<h2 className="timeline__title">{t('Scheduled actions')}</h2>

			{upcoming.length === 0 && past.length === 0 ? (
				<EmptyState
					icon="🗓"
					title={t('No scheduled actions yet')}
					text={t('Open, freeze, close or remind participants at a set time.')}
					action={
						canManage ? (
							<Button
								text={`✨ ${t('Plan with AI')}`}
								variant="secondary"
								size="small"
								onClick={onPlanWithAI}
							/>
						) : undefined
					}
					compact
				/>
			) : (
				<>
					{upcoming.length > 0 ? (
						<ol className="timeline__list" aria-label={t('Upcoming')}>
							{upcoming.map((action) => renderItem(action, false))}
						</ol>
					) : (
						<p className="timeline__time">{t('Nothing else is scheduled.')}</p>
					)}
					{past.length > 0 && (
						<details className="timeline__past">
							<summary>{tWithParams('Past ({{count}})', { count: past.length })}</summary>
							<ol className="timeline__list" aria-label={t('Past')}>
								{past.map((action) => renderItem(action, true))}
							</ol>
						</details>
					)}
				</>
			)}

			<ConfirmDialog
				isOpen={cancelling !== null}
				title={t('Cancel this scheduled action?')}
				text={t('It will not run. You can schedule it again later.')}
				confirmLabel={t('Cancel action')}
				danger
				operation="ScheduledTimeline.cancel"
				onConfirm={handleCancel}
				onCancel={() => setCancelling(null)}
			/>
		</section>
	);
};

export default ScheduledTimeline;
