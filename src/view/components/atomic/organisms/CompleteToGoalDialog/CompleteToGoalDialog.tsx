import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Target, AlertTriangle, Check } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { calculateDistancePerSupporter } from '@freedi/shared-types';
import type { AnswerMetricsResult } from '@freedi/shared-types';

/**
 * CompleteToGoalDialog Organism - Atomic Design System
 *
 * Modal dialog for completing an answer to its goal.
 * Shows breakdown of additional minutes needed and per-user distribution.
 * All styling is handled by SCSS in src/view/style/organisms/_complete-to-goal-dialog.scss
 */

// ============================================================================
// TYPES
// ============================================================================

export interface CompleteToGoalDialogProps {
	/** Whether the dialog is open */
	isOpen: boolean;

	/** Close handler */
	onClose: () => void;

	/** Confirm handler */
	onConfirm: () => void;

	/** Answer title */
	answerTitle: string;

	/** Answer cost in minutes */
	answerCost: number;

	/** Current metrics */
	metrics: AnswerMetricsResult;

	/** Number of group members */
	memberCount: number;

	/** Loading state */
	loading?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

const CompleteToGoalDialog: React.FC<CompleteToGoalDialogProps> = ({
	isOpen,
	onClose,
	onConfirm,
	answerTitle,
	answerCost,
	metrics,
	memberCount,
	loading = false,
}) => {
	const { t } = useTranslation();

	// Calculate breakdown
	const breakdown = useMemo(() => {
		const distanceToGoal = metrics.distanceToGoal;
		const distancePerUser = calculateDistancePerSupporter(
			distanceToGoal,
			metrics.weightedSupporters
		);
		const totalNeeded = distanceToGoal;

		return {
			distanceToGoal: Math.round(distanceToGoal * 10) / 10,
			memberCount,
			perUser: Math.round(distancePerUser * 10) / 10,
			totalNeeded: Math.round(totalNeeded * 10) / 10,
		};
	}, [metrics, memberCount]);

	// Handle backdrop click
	const handleBackdropClick = (e: React.MouseEvent) => {
		if (e.target === e.currentTarget) {
			onClose();
		}
	};

	// Handle escape key
	React.useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && isOpen) {
				onClose();
			}
		};

		if (isOpen) {
			document.addEventListener('keydown', handleEscape);
			document.body.style.overflow = 'hidden';
		}

		return () => {
			document.removeEventListener('keydown', handleEscape);
			document.body.style.overflow = '';
		};
	}, [isOpen, onClose]);

	if (!isOpen) return null;

	const dialogContent = (
		<div
			className={`complete-to-goal-dialog ${loading ? 'complete-to-goal-dialog--loading' : ''}`}
			onClick={handleBackdropClick}
			role="dialog"
			aria-modal="true"
			aria-labelledby="dialog-title"
		>
			{/* Overlay */}
			<div className="complete-to-goal-dialog__overlay" />

			{/* Content */}
			<div className="complete-to-goal-dialog__content">
				{/* Header */}
				<div className="complete-to-goal-dialog__header">
					<h2 id="dialog-title" className="complete-to-goal-dialog__title">
						<Target size={20} />
						{t('completeToGoal')}
					</h2>
					<button
						className="complete-to-goal-dialog__close"
						onClick={onClose}
						aria-label={t('Close')}
						disabled={loading}
					>
						<X size={20} />
					</button>
				</div>

				{/* Body */}
				<div className="complete-to-goal-dialog__body">
					<p className="complete-to-goal-dialog__description">
						{t('To bring')} &ldquo;<strong>{answerTitle}</strong>&rdquo; {t('to its goal, the group needs additional investment.')}
					</p>

					{/* Breakdown */}
					<div className="complete-to-goal-dialog__breakdown">
						<h3 className="complete-to-goal-dialog__breakdown-title">
							{t('Calculation Breakdown')}
						</h3>
						<div className="complete-to-goal-dialog__breakdown-grid">
							<div className="complete-to-goal-dialog__breakdown-item">
								<span className="complete-to-goal-dialog__breakdown-label">
									{t('timeRemaining')}
								</span>
								<span className="complete-to-goal-dialog__breakdown-value">
									{breakdown.distanceToGoal}
									<span className="complete-to-goal-dialog__breakdown-value-unit">
										{t('min')}
									</span>
								</span>
							</div>
							<div className="complete-to-goal-dialog__breakdown-item">
								<span className="complete-to-goal-dialog__breakdown-label">
									{t('Group Members')}
								</span>
								<span className="complete-to-goal-dialog__breakdown-value">
									{breakdown.memberCount}
								</span>
							</div>
							<div className="complete-to-goal-dialog__breakdown-item complete-to-goal-dialog__breakdown-item--highlight">
								<span className="complete-to-goal-dialog__breakdown-label">
									{t('Per Supporter')}
								</span>
								<span className="complete-to-goal-dialog__breakdown-value">
									{breakdown.perUser}
									<span className="complete-to-goal-dialog__breakdown-value-unit">
										{t('min')}
									</span>
								</span>
							</div>
							<div className="complete-to-goal-dialog__breakdown-item">
								<span className="complete-to-goal-dialog__breakdown-label">
									{t('timeGoal')}
								</span>
								<span className="complete-to-goal-dialog__breakdown-value">
									{answerCost}
									<span className="complete-to-goal-dialog__breakdown-value-unit">
										{t('min')}
									</span>
								</span>
							</div>
						</div>
					</div>

					{/* Warning */}
					<div className="complete-to-goal-dialog__warning">
						<div className="complete-to-goal-dialog__warning-icon">
							<AlertTriangle size={18} />
						</div>
						<p className="complete-to-goal-dialog__warning-text">
							{t('This action will add the needed minutes and immediately accept the answer. All supporters will be charged proportionally.')}
						</p>
					</div>
				</div>

				{/* Footer */}
				<div className="complete-to-goal-dialog__footer">
					<button
						className="complete-to-goal-dialog__btn complete-to-goal-dialog__btn--cancel"
						onClick={onClose}
						disabled={loading}
					>
						{t('Cancel')}
					</button>
					<button
						className="complete-to-goal-dialog__btn complete-to-goal-dialog__btn--confirm"
						onClick={onConfirm}
						disabled={loading}
					>
						<Check size={18} />
						{loading ? t('Processing...') : t('Confirm & Accept')}
					</button>
				</div>
			</div>
		</div>
	);

	// Render in portal
	return createPortal(dialogContent, document.body);
};

export default CompleteToGoalDialog;
