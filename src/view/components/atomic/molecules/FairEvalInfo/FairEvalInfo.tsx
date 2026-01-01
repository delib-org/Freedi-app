import React, { useState, useCallback } from 'react';
import clsx from 'clsx';
import { Clock, Check, Target } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import {
	getProgressPercentage,
	getAnswerStatus,
} from '@freedi/shared-types';
import type { FairEvalStatus, AnswerMetricsResult } from '@freedi/shared-types';
import { setAnswerCost, acceptFairEvalAnswer, completeToGoal } from '@/controllers/db/fairEval/fairEvalController';

/**
 * FairEvalInfo Molecule - Atomic Design System
 *
 * Compact metrics display for answer cards when fair evaluation is enabled.
 * Shows progress bar, metrics, and admin actions inline.
 * All styling is handled by SCSS in src/view/style/molecules/_fair-eval-info.scss
 */

// ============================================================================
// TYPES
// ============================================================================

export interface FairEvalInfoProps {
	/** Statement ID for the answer */
	statementId: string;

	/** Answer cost in minutes (0 or undefined if not set) */
	answerCost?: number;

	/** Cached metrics from server (may be undefined if no cost set) */
	metrics?: AnswerMetricsResult;

	/** Is current user an admin */
	isAdmin?: boolean;

	/** Has this answer been accepted */
	isAccepted?: boolean;

	/** Loading state */
	loading?: boolean;

	/** Additional CSS classes */
	className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

const FairEvalInfo: React.FC<FairEvalInfoProps> = ({
	statementId,
	answerCost = 0,
	metrics,
	isAdmin = false,
	isAccepted = false,
	loading = false,
	className,
}) => {
	const { t } = useTranslation();

	// Local state for admin actions
	const [costInput, setCostInput] = useState<string>(answerCost > 0 ? String(answerCost) : '');
	const [isSaving, setIsSaving] = useState(false);
	const [isAccepting, setIsAccepting] = useState(false);
	const [isCompleting, setIsCompleting] = useState(false);

	// Determine status
	const hasValidCost = answerCost > 0;
	const status: FairEvalStatus = metrics ? getAnswerStatus(metrics) : 'noSupport';
	const isGoalReached = status === 'reached';

	// Calculate progress
	const progressPercent = hasValidCost && metrics
		? getProgressPercentage(metrics.totalContribution, answerCost)
		: 0;

	// Build BEM classes
	const classes = clsx(
		'fair-eval-info',
		`fair-eval-info--${status}`,
		loading && 'fair-eval-info--loading',
		isAccepted && 'fair-eval-info--accepted',
		className
	);

	// Handle saving answer cost
	const handleSaveCost = useCallback(async () => {
		const cost = parseFloat(costInput);
		if (isNaN(cost) || cost <= 0) return;

		setIsSaving(true);
		try {
			await setAnswerCost(statementId, cost);
		} catch (error) {
			console.error('Failed to set answer cost:', error);
		} finally {
			setIsSaving(false);
		}
	}, [statementId, costInput]);

	// Handle accepting answer
	const handleAccept = useCallback(async () => {
		if (!isGoalReached) return;

		setIsAccepting(true);
		try {
			await acceptFairEvalAnswer(statementId);
		} catch (error) {
			console.error('Failed to accept answer:', error);
		} finally {
			setIsAccepting(false);
		}
	}, [statementId, isGoalReached]);

	// Handle complete to goal
	const handleCompleteToGoal = useCallback(async () => {
		setIsCompleting(true);
		try {
			await completeToGoal(statementId);
		} catch (error) {
			console.error('Failed to complete to goal:', error);
		} finally {
			setIsCompleting(false);
		}
	}, [statementId]);

	// If already accepted, show accepted badge
	if (isAccepted) {
		return (
			<div className={classes}>
				<div className="fair-eval-info__header">
					<span className="fair-eval-info__title">
						<Clock size={14} />
						{t('Fair Evaluation')}
					</span>
					<span className="fair-eval-info__status-badge fair-eval-info__status-badge--reached">
						{t('Accepted')}
					</span>
				</div>
			</div>
		);
	}

	// If no cost set and user is admin, show cost input
	if (!hasValidCost && isAdmin) {
		return (
			<div className={classes}>
				<div className="fair-eval-info__header">
					<span className="fair-eval-info__title">
						<Clock size={14} />
						{t('Fair Evaluation')}
					</span>
				</div>
				<div className="fair-eval-info__cost-input">
					<span className="fair-eval-info__cost-label">{t('timeGoal')}:</span>
					<div className="fair-eval-info__cost-field">
						<input
							type="number"
							min="1"
							value={costInput}
							onChange={(e) => setCostInput(e.target.value)}
							placeholder="0"
							className="fair-eval-info__cost-input-field"
							disabled={isSaving}
						/>
						<span className="fair-eval-info__cost-unit">{t('min')}</span>
					</div>
					<button
						onClick={handleSaveCost}
						disabled={isSaving || !costInput || parseFloat(costInput) <= 0}
						className="fair-eval-info__cost-save"
					>
						{isSaving ? '...' : t('Save')}
					</button>
				</div>
			</div>
		);
	}

	// If no cost set and user is not admin, show message
	if (!hasValidCost) {
		return (
			<div className={classes}>
				<div className="fair-eval-info__header">
					<span className="fair-eval-info__title">
						<Clock size={14} />
						{t('Fair Evaluation')}
					</span>
				</div>
				<div className="fair-eval-info__no-cost">
					{t('timeGoal')} {t('not set')}
				</div>
			</div>
		);
	}

	// Full display with metrics
	return (
		<div className={classes}>
			{/* Header */}
			<div className="fair-eval-info__header">
				<span className="fair-eval-info__title">
					<Clock size={14} />
					{t('Fair Evaluation')}
				</span>
				<span className={`fair-eval-info__status-badge fair-eval-info__status-badge--${status}`}>
					{status === 'reached' && t('goalReached')}
					{status === 'hasSupport' && t('hasSupport')}
					{status === 'noSupport' && t('noSupport')}
				</span>
			</div>

			{/* Progress Bar */}
			<div className="fair-eval-info__progress">
				<div className="fair-eval-info__progress-bar">
					<div
						className="fair-eval-info__progress-fill"
						style={{ width: `${Math.min(progressPercent, 100)}%` }}
						role="progressbar"
						aria-valuenow={progressPercent}
						aria-valuemin={0}
						aria-valuemax={100}
					/>
				</div>
				<div className="fair-eval-info__progress-labels">
					<span>{Math.round(metrics?.totalContribution ?? 0)} {t('min')}</span>
					<span>{t('of')} {answerCost} {t('min')}</span>
				</div>
			</div>

			{/* Metrics Grid */}
			{metrics && (
				<div className="fair-eval-info__metrics">
					<div className="fair-eval-info__metric">
						<span className="fair-eval-info__metric-value">
							{metrics.weightedSupporters.toFixed(1)}
						</span>
						<span className="fair-eval-info__metric-label">
							{t('supportLevel')}
						</span>
					</div>
					<div className="fair-eval-info__metric">
						<span className="fair-eval-info__metric-value">
							{Math.round(metrics.totalContribution)}
						</span>
						<span className="fair-eval-info__metric-label">
							{t('investedTime')}
						</span>
					</div>
					<div className="fair-eval-info__metric">
						<span className="fair-eval-info__metric-value">
							{Math.round(metrics.distanceToGoal)}
						</span>
						<span className="fair-eval-info__metric-label">
							{t('timeRemaining')}
						</span>
					</div>
				</div>
			)}

			{/* Admin Actions */}
			{isAdmin && (
				<div className="fair-eval-info__actions">
					{isGoalReached ? (
						<button
							onClick={handleAccept}
							disabled={isAccepting || loading}
							className="fair-eval-info__action-btn fair-eval-info__action-btn--accept"
						>
							<Check size={14} />
							{isAccepting ? '...' : t('acceptAnswer')}
						</button>
					) : (
						<button
							onClick={handleCompleteToGoal}
							disabled={isCompleting || loading}
							className="fair-eval-info__action-btn fair-eval-info__action-btn--complete"
						>
							<Target size={14} />
							{isCompleting ? '...' : t('completeToGoal')}
						</button>
					)}
				</div>
			)}
		</div>
	);
};

export default FairEvalInfo;
