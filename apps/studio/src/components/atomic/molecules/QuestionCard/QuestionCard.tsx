import React from 'react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import type { ActivityRunState } from '@freedi/event-core';
import type { ActivityType } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/react';
import { StatusPill, ActivityTypeChip, Tag } from '@/components/atomic/atoms/Tag';
import { ProgressFunnel, type ProgressCounts } from '@/components/atomic/atoms/ProgressFunnel';
import { Skeleton } from '@/components/atomic/atoms/Skeleton';
import { useRelativeTime } from '@/hooks/useRelativeTime';

/**
 * QuestionCard molecule — one question in the consultant's grid. The title
 * is the (stretched) link, so the whole card is clickable and the accessible
 * name is the title. Pass `to` for a router link, otherwise `onOpen` fires.
 * Styles: styles/molecules/_question-card.scss
 */

export const MAX_ENGINE_CHIPS = 4;

export interface QuestionCardProps {
	questionId: string;
	title: string;
	status: ActivityRunState;
	progress: ProgressCounts;
	memberCount: number;
	activityCount: number;
	/** Engines used by the question's activities (deduplicated, max 4 shown). */
	engines: ActivityType[];
	lastActivityAt?: number;
	onOpen?: (questionId: string) => void;
	/** Router path — renders the card as a link instead of a button. */
	to?: string;
	className?: string;
}

const QuestionCard: React.FC<QuestionCardProps> = ({
	questionId,
	title,
	status,
	progress,
	memberCount,
	activityCount,
	engines,
	lastActivityAt,
	onOpen,
	to,
	className,
}) => {
	const { t, tWithParams } = useTranslation();
	const relative = useRelativeTime(lastActivityAt);
	const uniqueEngines = Array.from(new Set(engines));
	const shownEngines = uniqueEngines.slice(0, MAX_ENGINE_CHIPS);
	const hiddenEngineCount = uniqueEngines.length - shownEngines.length;
	const displayTitle = title.trim() || t('Untitled');

	return (
		<article className={clsx('question-card', `question-card--status-${status}`, className)}>
			<div className="question-card__header">
				<h3 className="question-card__title" dir="auto">
					{to ? (
						<Link className="question-card__link" to={to}>
							{displayTitle}
						</Link>
					) : (
						<button
							type="button"
							className="question-card__link"
							onClick={() => onOpen?.(questionId)}
						>
							{displayTitle}
						</button>
					)}
				</h3>
				<span className="question-card__status">
					<StatusPill status={status} />
				</span>
			</div>

			<div className="question-card__rollup">
				<ProgressFunnel counts={progress} variant="full" />
			</div>

			<p className="question-card__meta">
				<span className="question-card__meta-item">
					{tWithParams('{{count}} activities', { count: activityCount })}
				</span>
				<span className="question-card__meta-item">
					{tWithParams('{{count}} members', { count: memberCount })}
				</span>
				{lastActivityAt !== undefined && (
					<span className="question-card__meta-item">
						{t('Last activity')}{' '}
						<time dateTime={new Date(lastActivityAt).toISOString()}>{relative}</time>
					</span>
				)}
			</p>

			{shownEngines.length > 0 && (
				<div className="question-card__engines">
					{shownEngines.map((engine) => (
						<ActivityTypeChip key={engine} type={engine} />
					))}
					{hiddenEngineCount > 0 && <Tag outline>+{hiddenEngineCount}</Tag>}
				</div>
			)}
		</article>
	);
};

export default QuestionCard;

/** Loading placeholder with the same footprint as a QuestionCard. */
export const QuestionCardSkeleton: React.FC<{ className?: string }> = ({ className }) => (
	<div className={clsx('question-card', 'question-card--skeleton', className)} aria-hidden="true">
		<div className="question-card__header">
			<Skeleton variant="title" width="70%" />
			<Skeleton variant="button" width="5rem" height="1.5rem" />
		</div>
		<Skeleton variant="text" height="0.75rem" />
		<Skeleton variant="text" width="60%" />
		<div className="question-card__engines">
			<Skeleton variant="button" width="6rem" height="1.5rem" />
			<Skeleton variant="button" width="5rem" height="1.5rem" />
		</div>
	</div>
);
