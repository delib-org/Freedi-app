import React from 'react';
import clsx from 'clsx';
import type { DerivedActivity } from '@freedi/event-core';
import { ActivityType } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/react';
import { StatusPill, getActivityPresentation } from '@/components/atomic/atoms/Tag';
import { ProgressFunnel, type ProgressCounts } from '@/components/atomic/atoms/ProgressFunnel';
import { Skeleton } from '@/components/atomic/atoms/Skeleton';
import { useRelativeTime } from '@/hooks/useRelativeTime';

/**
 * ActivityRow molecule — one activity in the ActivityBoard (role="row").
 * Table row on desktop, bordered card ≤1024px.
 * Styles: styles/molecules/_activity-row.scss
 */

export type ActivityQuickAction = 'open' | 'run';

export interface ActivityRowProps {
	activity: DerivedActivity;
	/** 1-based position shown in the order cell. */
	index?: number;
	progress?: ProgressCounts;
	memberCount?: number;
	lastActivityAt?: number;
	selected?: boolean;
	/** No recent activity while open — dims the row, highlights the time. */
	stale?: boolean;
	/** Hides quick actions (viewer role). */
	readOnly?: boolean;
	onSelect: (statementId: string) => void;
	onQuickAction: (statementId: string, action: ActivityQuickAction) => void;
}

const EMPTY_PROGRESS: ProgressCounts = { entered: 0, suggested: 0, evaluated: 0 };

function formatCount(value: number | undefined, locale: string): string {
	if (value === undefined) return '—';
	try {
		return new Intl.NumberFormat(locale).format(value);
	} catch {
		return String(value);
	}
}

const ActivityRow: React.FC<ActivityRowProps> = ({
	activity,
	index,
	progress = EMPTY_PROGRESS,
	memberCount,
	lastActivityAt,
	selected = false,
	stale = false,
	readOnly = false,
	onSelect,
	onQuickAction,
}) => {
	const { t, currentLanguage } = useTranslation();
	const relative = useRelativeTime(lastActivityAt);
	const { label, icon, modifier } = getActivityPresentation(activity.type);
	const { statementId, runState } = activity;
	const title = activity.title.trim() || t('Untitled');

	const classes = clsx(
		'activity-row',
		`activity-row--status-${runState}`,
		`activity-row--type-${modifier}`,
		selected && 'activity-row--selected',
		stale && 'activity-row--stale',
	);

	const canOpenNow = !readOnly && runState === 'queued';
	const canRun = !readOnly && activity.type === ActivityType.join;

	return (
		<div className={classes} role="row" aria-selected={selected || undefined}>
			<span className="activity-row__order" role="cell">
				{index !== undefined ? formatCount(index, currentLanguage) : ''}
			</span>

			<span className="activity-row__type" role="cell" aria-label={t(label)}>
				<span aria-hidden="true">{icon}</span>
			</span>

			<div className="activity-row__main" role="cell">
				<button
					type="button"
					className="activity-row__title"
					dir="auto"
					onClick={() => onSelect(statementId)}
				>
					{title}
				</button>
				<span className="activity-row__subtitle">{t(label)}</span>
			</div>

			<div className="activity-row__progress" role="cell">
				<ProgressFunnel counts={progress} variant="mini" />
				<span className="activity-row__numbers" aria-hidden="true">
					<span>{formatCount(progress.entered, currentLanguage)}</span>
					<span>{formatCount(progress.suggested, currentLanguage)}</span>
					<span>{formatCount(progress.evaluated, currentLanguage)}</span>
				</span>
			</div>

			<span className="activity-row__members" role="cell" aria-label={t('Members')}>
				{formatCount(memberCount, currentLanguage)}
			</span>

			<span className="activity-row__activity" role="cell" aria-label={t('Last activity')}>
				{lastActivityAt !== undefined ? (
					<time dateTime={new Date(lastActivityAt).toISOString()}>{relative}</time>
				) : (
					'—'
				)}
			</span>

			<span className="activity-row__status" role="cell">
				<StatusPill status={runState} />
			</span>

			<div className="activity-row__actions" role="cell">
				{canOpenNow && (
					<button
						type="button"
						className="button button--primary button--small"
						onClick={() => onQuickAction(statementId, 'open')}
					>
						{t('Open now')}
					</button>
				)}
				{canRun && (
					<button
						type="button"
						className="button button--secondary button--small"
						onClick={() => onQuickAction(statementId, 'run')}
					>
						<span aria-hidden="true">▶ </span>
						{t('Run')}
					</button>
				)}
				<button
					type="button"
					className="activity-row__chevron"
					onClick={() => onSelect(statementId)}
					aria-label={t('Open details')}
				>
					<span aria-hidden="true">›</span>
				</button>
			</div>
		</div>
	);
};

export default ActivityRow;

/** Loading placeholder row. */
export const ActivityRowSkeleton: React.FC = () => (
	<div className="activity-row activity-row--skeleton" role="row" aria-hidden="true">
		<span className="activity-row__order" role="cell" />
		<span className="activity-row__type" role="cell">
			<Skeleton variant="avatar" width="2rem" height="2rem" />
		</span>
		<div className="activity-row__main" role="cell">
			<Skeleton variant="text" width="60%" />
			<Skeleton variant="text" width="30%" height="0.75rem" />
		</div>
		<div className="activity-row__progress" role="cell">
			<Skeleton variant="text" width="6rem" height="0.5rem" />
		</div>
		<span className="activity-row__members" role="cell">
			<Skeleton variant="text" width="2rem" />
		</span>
		<span className="activity-row__activity" role="cell">
			<Skeleton variant="text" width="4rem" />
		</span>
		<span className="activity-row__status" role="cell">
			<Skeleton variant="button" width="5rem" height="1.5rem" />
		</span>
		<div className="activity-row__actions" role="cell" />
	</div>
);
