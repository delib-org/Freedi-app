import React, { useMemo } from 'react';
import clsx from 'clsx';
import { Clock, Users, Target, Check } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import type { FairEvalStatus, AnswerMetricsResult } from '@freedi/shared-types';
import { getProgressPercentage } from '@freedi/shared-types';
import { StatusIndicator } from '../../atoms/StatusIndicator';
import { Button } from '../../atoms/Button';

/**
 * FairEvalCard Molecule - Atomic Design System
 *
 * Enhanced answer card with progress bar, metrics, and admin controls.
 * All styling is handled by SCSS in src/view/style/molecules/_fair-eval-card.scss
 */

// ============================================================================
// TYPES
// ============================================================================

export type FairEvalCardSize = 'compact' | 'medium' | 'expanded';

export interface FairEvalCardProps {
	/** Statement ID */
	statementId: string;

	/** Answer title/content */
	title: string;

	/** Answer cost in minutes */
	cost: number;

	/** Calculated metrics */
	metrics: AnswerMetricsResult;

	/** Current status */
	status: FairEvalStatus;

	/** Is current user an admin */
	isAdmin?: boolean;

	/** Size variant */
	size?: FairEvalCardSize;

	/** Loading state */
	loading?: boolean;

	/** Selected state */
	selected?: boolean;

	/** Has been accepted */
	accepted?: boolean;

	/** Click handler for card */
	onClick?: () => void;

	/** Accept answer handler (admin) */
	onAccept?: (statementId: string) => void;

	/** Complete to goal handler (admin) */
	onCompleteToGoal?: (statementId: string) => void;

	/** Additional CSS classes */
	className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

const FairEvalCard: React.FC<FairEvalCardProps> = ({
	statementId,
	title,
	cost,
	metrics,
	status,
	isAdmin = false,
	size = 'medium',
	loading = false,
	selected = false,
	accepted = false,
	onClick,
	onAccept,
	onCompleteToGoal,
	className,
}) => {
	const { t } = useTranslation();

	// Calculate progress percentage
	const progressPercent = useMemo(() => {
		return getProgressPercentage(metrics.totalContribution, cost);
	}, [metrics.totalContribution, cost]);

	// Check if goal is reached
	const isGoalReached = status === 'reached';

	// Build BEM classes
	const classes = clsx(
		'fair-eval-card',
		`fair-eval-card--${status}`,
		size !== 'medium' && `fair-eval-card--${size}`,
		isAdmin && 'fair-eval-card--admin',
		!isAdmin && 'fair-eval-card--user',
		loading && 'fair-eval-card--loading',
		selected && 'fair-eval-card--selected',
		accepted && 'fair-eval-card--accepted',
		className
	);

	const handleClick = (): void => {
		if (onClick && !loading) {
			onClick();
		}
	};

	const handleAccept = (e: React.MouseEvent): void => {
		e.stopPropagation();
		if (onAccept && !loading) {
			onAccept(statementId);
		}
	};

	const handleCompleteToGoal = (e: React.MouseEvent): void => {
		e.stopPropagation();
		if (onCompleteToGoal && !loading) {
			onCompleteToGoal(statementId);
		}
	};

	return (
		<article
			className={classes}
			onClick={handleClick}
			role={onClick ? 'button' : 'article'}
			tabIndex={onClick ? 0 : undefined}
			aria-busy={loading}
		>
			{/* Header */}
			<div className="fair-eval-card__header">
				<h3 className="fair-eval-card__title">{title}</h3>
				<StatusIndicator
					status={status}
					badge
					className="fair-eval-card__status"
				/>
			</div>

			{/* Progress Bar */}
			<div className="fair-eval-card__progress">
				<div className="fair-eval-card__progress-bar">
					<div
						className="fair-eval-card__progress-fill"
						style={{ width: `${Math.min(progressPercent, 100)}%` }}
						role="progressbar"
						aria-valuenow={progressPercent}
						aria-valuemin={0}
						aria-valuemax={100}
					/>
				</div>
				<div className="fair-eval-card__progress-labels">
					<span className="fair-eval-card__progress-current">
						{Math.round(metrics.totalContribution)} {t('min')}
					</span>
					<span className="fair-eval-card__progress-goal">
						{t('of')} {cost} {t('min')}
					</span>
				</div>
			</div>

			{/* Metrics Grid */}
			<div className="fair-eval-card__metrics">
				<div className="fair-eval-card__metric">
					<span className="fair-eval-card__metric-value">
						{metrics.weightedSupporters.toFixed(1)}
					</span>
					<span className="fair-eval-card__metric-label">
						{t('supportLevel')}
					</span>
				</div>
				<div className="fair-eval-card__metric">
					<span className="fair-eval-card__metric-value">
						{Math.round(metrics.totalContribution)}
					</span>
					<span className="fair-eval-card__metric-label">
						{t('investedTime')}
					</span>
				</div>
				<div className="fair-eval-card__metric">
					<span className="fair-eval-card__metric-value">
						{Math.round(metrics.distanceToGoal)}
					</span>
					<span className="fair-eval-card__metric-label">
						{t('timeRemaining')}
					</span>
				</div>
			</div>

			{/* Admin Actions */}
			{isAdmin && (
				<div className="fair-eval-card__actions">
					{isGoalReached ? (
						<Button
							text={t('acceptAnswer')}
							variant="agree"
							onClick={handleAccept}
							disabled={loading || accepted}
							icon={<Check />}
							className="fair-eval-card__action-btn"
						/>
					) : (
						<Button
							text={t('completeToGoal')}
							variant="primary"
							onClick={handleCompleteToGoal}
							disabled={loading}
							icon={<Target />}
							className="fair-eval-card__action-btn"
						/>
					)}
				</div>
			)}

			{/* Footer */}
			<div className="fair-eval-card__footer">
				<span className="fair-eval-card__cost">
					<Clock size={14} />
					{cost} {t('min')} {t('timeGoal').toLowerCase()}
				</span>
				<span className="fair-eval-card__supporters">
					<Users size={14} />
					{Math.round(metrics.weightedSupporters)} {t('supporters')}
				</span>
			</div>
		</article>
	);
};

export default FairEvalCard;
