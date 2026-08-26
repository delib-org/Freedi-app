import React from 'react';
import clsx from 'clsx';
import type { DerivedActivity } from '@freedi/event-core';
import { useTranslation } from '@freedi/shared-i18n/react';
import type { ProgressCounts } from '@/components/atomic/atoms/ProgressFunnel';
import { EmptyState } from '@/components/atomic/atoms/EmptyState';
import ActivityRow, { ActivityRowSkeleton, type ActivityQuickAction } from './ActivityRow';

/**
 * ActivityBoard molecule — role="table" list of ActivityRows with column
 * headers (visually hidden ≤1024px, where rows become cards).
 * Styles: styles/molecules/_activity-board.scss
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** An OPEN activity with no activity for this long is flagged stale. */
export const STALE_AFTER_MS = 7 * DAY_MS;
const SKELETON_ROWS = 3;

export interface ActivityBoardProps {
	activities: DerivedActivity[];
	progressById?: Record<string, ProgressCounts>;
	membersById?: Record<string, number>;
	lastActivityById?: Record<string, number>;
	selectedId?: string;
	loading?: boolean;
	readOnly?: boolean;
	onSelect: (statementId: string) => void;
	onQuickAction: (statementId: string, action: ActivityQuickAction) => void;
	emptyState?: React.ReactNode;
	/** Accessible name of the table (defaults to "Activities"). */
	ariaLabel?: string;
	className?: string;
}

const COLUMNS: readonly string[] = [
	'Order',
	'Type',
	'Activity',
	'Progress',
	'Members',
	'Last activity',
	'Status',
	'Actions',
];

export function isStale(
	activity: DerivedActivity,
	lastActivityAt: number | undefined,
	now: number = Date.now(),
): boolean {
	return (
		activity.runState === 'open' &&
		lastActivityAt !== undefined &&
		now - lastActivityAt > STALE_AFTER_MS
	);
}

const ActivityBoard: React.FC<ActivityBoardProps> = ({
	activities,
	progressById = {},
	membersById = {},
	lastActivityById = {},
	selectedId,
	loading = false,
	readOnly = false,
	onSelect,
	onQuickAction,
	emptyState,
	ariaLabel,
	className,
}) => {
	const { t } = useTranslation();
	const isEmpty = !loading && activities.length === 0;

	return (
		<div
			className={clsx('activity-board', className)}
			role="table"
			aria-label={ariaLabel ?? t('Activities')}
		>
			<div className="activity-board__head" role="row">
				{COLUMNS.map((column) => (
					<span key={column} className="activity-board__columnheader" role="columnheader">
						{t(column)}
					</span>
				))}
			</div>

			<div className="activity-board__body" role="rowgroup" aria-busy={loading || undefined}>
				{loading &&
					Array.from({ length: SKELETON_ROWS }, (_, i) => <ActivityRowSkeleton key={i} />)}

				{!loading &&
					activities.map((activity, index) => {
						const lastActivityAt = lastActivityById[activity.statementId];

						return (
							<ActivityRow
								key={activity.statementId}
								activity={activity}
								index={index + 1}
								progress={progressById[activity.statementId]}
								memberCount={membersById[activity.statementId]}
								lastActivityAt={lastActivityAt}
								selected={activity.statementId === selectedId}
								stale={isStale(activity, lastActivityAt)}
								readOnly={readOnly}
								onSelect={onSelect}
								onQuickAction={onQuickAction}
							/>
						);
					})}
			</div>

			{isEmpty && (
				<div className="activity-board__empty">
					{emptyState ?? (
						<EmptyState
							compact
							icon="📋"
							title={t('No activities yet')}
							text={t('Add an activity to give participants something to do.')}
						/>
					)}
				</div>
			)}
		</div>
	);
};

export default ActivityBoard;
