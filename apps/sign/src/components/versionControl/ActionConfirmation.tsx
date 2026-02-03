'use client';

import React, { useEffect, useRef } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import styles from './actionConfirmation.module.scss';

interface ActionConfirmationProps {
	action: 'approve' | 'reject';
	isProcessing: boolean;
	hasNotes: boolean;
	isEdited?: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}

/**
 * Action Confirmation Dialog
 *
 * Provides a clear confirmation step before executing approve/reject actions.
 * Shows relevant warnings and explains what will happen.
 */
export function ActionConfirmation({
	action,
	isProcessing,
	hasNotes,
	isEdited,
	onConfirm,
	onCancel,
}: ActionConfirmationProps) {
	const { t } = useTranslation();
	const confirmButtonRef = useRef<HTMLButtonElement>(null);

	// Focus confirm button on mount
	useEffect(() => {
		confirmButtonRef.current?.focus();
	}, []);

	// Handle keyboard events
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !isProcessing) {
				onConfirm();
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [onConfirm, isProcessing]);

	const isApprove = action === 'approve';

	return (
		<div
			className={styles.confirmation}
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="confirmation-title"
			aria-describedby="confirmation-description"
		>
			<div className={styles.confirmation__dialog}>
				{/* Icon */}
				<div className={`${styles.confirmation__icon} ${isApprove ? styles['confirmation__icon--approve'] : styles['confirmation__icon--reject']}`}>
					{isApprove ? (
						<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<polyline points="20,6 9,17 4,12" />
						</svg>
					) : (
						<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					)}
				</div>

				{/* Title */}
				<h3 id="confirmation-title" className={styles.confirmation__title}>
					{isApprove ? t('Confirm Approval') : t('Confirm Rejection')}
				</h3>

				{/* Description */}
				<p id="confirmation-description" className={styles.confirmation__description}>
					{isApprove
						? t('This will update the document paragraph with the proposed change. This action can be undone through version history.')
						: t('This will reject the suggestion and notify the creator. The suggestion will be removed from the queue.')
					}
				</p>

				{/* Warnings/Info */}
				<div className={styles.confirmation__info}>
					{isApprove && isEdited && (
						<div className={`${styles.confirmation__infoItem} ${styles['confirmation__infoItem--warning']}`}>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
								<line x1="12" y1="9" x2="12" y2="13" />
								<line x1="12" y1="17" x2="12.01" y2="17" />
							</svg>
							<span>{t('You have edited the proposed text. Your edits will be applied.')}</span>
						</div>
					)}

					{isApprove && (
						<div className={`${styles.confirmation__infoItem} ${styles['confirmation__infoItem--success']}`}>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<circle cx="12" cy="12" r="10" />
								<polyline points="12,6 12,12 16,14" />
							</svg>
							<span>{t('A version history entry will be created for this change.')}</span>
						</div>
					)}

					{!isApprove && !hasNotes && (
						<div className={`${styles.confirmation__infoItem} ${styles['confirmation__infoItem--error']}`}>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<circle cx="12" cy="12" r="10" />
								<line x1="12" y1="8" x2="12" y2="12" />
								<line x1="12" y1="16" x2="12.01" y2="16" />
							</svg>
							<span>{t('Please provide a reason for rejection in the admin notes.')}</span>
						</div>
					)}

					{!isApprove && hasNotes && (
						<div className={`${styles.confirmation__infoItem} ${styles['confirmation__infoItem--info']}`}>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<circle cx="12" cy="12" r="10" />
								<line x1="12" y1="16" x2="12" y2="12" />
								<line x1="12" y1="8" x2="12.01" y2="8" />
							</svg>
							<span>{t('The creator will be notified with your reason for rejection.')}</span>
						</div>
					)}
				</div>

				{/* Actions */}
				<div className={styles.confirmation__actions}>
					<button
						type="button"
						onClick={onCancel}
						className={styles.confirmation__cancel}
						disabled={isProcessing}
					>
						{t('Cancel')}
					</button>

					<button
						ref={confirmButtonRef}
						type="button"
						onClick={onConfirm}
						disabled={isProcessing || (!isApprove && !hasNotes)}
						className={`${styles.confirmation__confirm} ${isApprove ? styles['confirmation__confirm--approve'] : styles['confirmation__confirm--reject']}`}
					>
						{isProcessing ? (
							<>
								<span className={styles.confirmation__spinner} />
								{isApprove ? t('Approving...') : t('Rejecting...')}
							</>
						) : (
							<>
								{isApprove ? (
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
										<polyline points="20,6 9,17 4,12" />
									</svg>
								) : (
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
										<line x1="18" y1="6" x2="6" y2="18" />
										<line x1="6" y1="6" x2="18" y2="18" />
									</svg>
								)}
								{isApprove ? t('Yes, Approve') : t('Yes, Reject')}
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
