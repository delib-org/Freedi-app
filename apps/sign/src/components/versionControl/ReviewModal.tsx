'use client';

import React, { useState, useEffect } from 'react';
import { useReplacementQueueStore } from '@/store/replacementQueueStore';
import { useVersionControlStore } from '@/store/versionControlStore';
import { PendingReplacement } from '@freedi/shared-types';
import styles from './versionControl.module.scss';

interface ReviewModalProps {
	queueItem: PendingReplacement;
	onClose: () => void;
}

/**
 * Review Modal Component
 * Detailed review UI with approve/reject actions
 */
export function ReviewModal({ queueItem, onClose }: ReviewModalProps) {
	const { approveReplacement, rejectReplacement } = useReplacementQueueStore();
	const { getSettings } = useVersionControlStore();

	const settings = getSettings(queueItem.documentId);

	const [editedText, setEditedText] = useState(queueItem.proposedText);
	const [adminNotes, setAdminNotes] = useState('');
	const [isProcessing, setIsProcessing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [liveConsensus] = useState(queueItem.consensus);

	// Track if text was edited
	const isEdited = editedText !== queueItem.proposedText;

	const handleApprove = async () => {
		setIsProcessing(true);
		setError(null);

		try {
			await approveReplacement(
				queueItem.queueId,
				isEdited ? editedText : undefined,
				adminNotes || undefined
			);
			onClose();
		} catch (error) {
			setError(error instanceof Error ? error.message : 'Failed to approve');
			setIsProcessing(false);
		}
	};

	const handleReject = async () => {
		if (!adminNotes) {
			setError('Please provide a reason for rejection');
			return;
		}

		setIsProcessing(true);
		setError(null);

		try {
			await rejectReplacement(queueItem.queueId, adminNotes);
			onClose();
		} catch (error) {
			setError(error instanceof Error ? error.message : 'Failed to reject');
			setIsProcessing(false);
		}
	};

	// Close on Escape key
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', handleEscape);
		return () => window.removeEventListener('keydown', handleEscape);
	}, [onClose]);

	return (
		<div className={styles['review-modal-overlay']} onClick={onClose}>
			<div className={styles['review-modal']} onClick={(e) => e.stopPropagation()}>
				{/* Header */}
				<div className={styles['review-modal__header']}>
					<h2 className={styles['review-modal__title']}>Review Suggestion</h2>
					<button
						onClick={onClose}
						className={styles['review-modal__close']}
						aria-label="Close"
					>
						×
					</button>
				</div>

				{/* Consensus Info */}
				<div className={styles['review-modal__consensus']}>
					<div className={styles['review-modal__consensus-snapshot']}>
						Created: {Math.round(queueItem.consensusAtCreation * 100)}%
					</div>
					{liveConsensus !== queueItem.consensusAtCreation && (
						<div className={styles['review-modal__consensus-live']}>
							→ Now: {Math.round(liveConsensus * 100)}%
						</div>
					)}
					<div className={styles['review-modal__consensus-votes']}>
						{queueItem.evaluationCount} votes
					</div>
				</div>

				{/* Content Comparison */}
				<div className={styles['review-modal__comparison']}>
					<div className={styles['review-modal__current']}>
						<h3 className={styles['review-modal__subtitle']}>Current Text</h3>
						<div className={styles['review-modal__text']}>{queueItem.currentText}</div>
					</div>

					<div className={styles['review-modal__proposed']}>
						<h3 className={styles['review-modal__subtitle']}>
							Proposed Text
							{isEdited && <span className={styles['review-modal__edited-badge']}>Edited</span>}
						</h3>
						{settings.allowAdminEdit ? (
							<textarea
								value={editedText}
								onChange={(e) => setEditedText(e.target.value)}
								className={styles['review-modal__textarea']}
								rows={8}
							/>
						) : (
							<div className={styles['review-modal__text']}>{queueItem.proposedText}</div>
						)}
					</div>
				</div>

				{/* Admin Notes */}
				<div className={styles['review-modal__notes']}>
					<label className={styles['review-modal__label']}>
						Admin Notes (optional for approval, required for rejection):
					</label>
					<textarea
						value={adminNotes}
						onChange={(e) => setAdminNotes(e.target.value)}
						placeholder="Add any notes about this decision..."
						className={styles['review-modal__textarea']}
						rows={3}
					/>
				</div>

				{/* Error */}
				{error && <div className={styles['review-modal__error']}>{error}</div>}

				{/* Actions */}
				<div className={styles['review-modal__actions']}>
					<button
						onClick={handleReject}
						disabled={isProcessing}
						className={`${styles['review-modal__button']} ${styles['review-modal__button--reject']}`}
					>
						{isProcessing ? 'Rejecting...' : 'Reject'}
					</button>
					<button
						onClick={handleApprove}
						disabled={isProcessing}
						className={`${styles['review-modal__button']} ${styles['review-modal__button--approve']}`}
					>
						{isProcessing ? 'Approving...' : 'Approve'}
					</button>
				</div>

				{/* Creator Info */}
				<div className={styles['review-modal__meta']}>
					Suggested by {queueItem.creatorDisplayName || 'Anonymous'}
				</div>
			</div>
		</div>
	);
}
