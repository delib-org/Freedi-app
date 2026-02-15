'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useReplacementQueueStore } from '@/store/replacementQueueStore';
import { useVersionControlStore } from '@/store/versionControlStore';
import { PendingReplacement, Paragraph } from '@freedi/shared-types';
import { DiffView } from './DiffView';
import { DocumentContextPanel } from './DocumentContextPanel';
import { ActionConfirmation } from './ActionConfirmation';
import { stripHtml } from '@/utils/textUtils';
import styles from './enhancedReviewModal.module.scss';

interface EnhancedReviewModalProps {
	queueItem: PendingReplacement;
	onClose: () => void;
	documentTitle?: string;
	paragraphs?: Paragraph[];
	onNavigateToContext?: (paragraphId: string) => void;
}

type ViewMode = 'diff' | 'sideBySide' | 'context';
type ActionType = 'approve' | 'reject' | null;

/**
 * Enhanced Review Modal - Comprehensive review interface
 *
 * Design improvements:
 * 1. Tabbed interface for different view modes (diff, side-by-side, context)
 * 2. Document context showing paragraph location and surrounding content
 * 3. Rich diff visualization with word-level highlighting
 * 4. Impact preview showing what will change
 * 5. Confirmation dialog for actions
 * 6. Keyboard navigation support
 */
export function EnhancedReviewModal({
	queueItem,
	onClose,
	documentTitle,
	paragraphs,
	onNavigateToContext,
}: EnhancedReviewModalProps) {
	const { t, tWithParams } = useTranslation();
	const { approveReplacement, rejectReplacement } = useReplacementQueueStore();
	const { getSettings } = useVersionControlStore();

	const settings = getSettings(queueItem.documentId);

	// State - Strip HTML from queue item text (for backward compatibility with existing data)
	const [viewMode, setViewMode] = useState<ViewMode>('diff');
	const [editedText, setEditedText] = useState(stripHtml(queueItem.proposedText));
	const [adminNotes, setAdminNotes] = useState('');
	const [isProcessing, setIsProcessing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [pendingAction, setPendingAction] = useState<ActionType>(null);

	// Derived state
	const originalProposedText = stripHtml(queueItem.proposedText);
	const isEdited = editedText !== originalProposedText;
	const consensusDrop = queueItem.consensusAtCreation - queueItem.consensus;
	const isStale = consensusDrop > 0.1;

	// Find paragraph context
	const paragraphIndex = paragraphs?.findIndex(p => p.paragraphId === queueItem.paragraphId) ?? -1;
	const currentParagraph = paragraphs?.[paragraphIndex];
	const prevParagraph = paragraphIndex > 0 ? paragraphs?.[paragraphIndex - 1] : undefined;
	const nextParagraph = paragraphIndex < (paragraphs?.length ?? 0) - 1 ? paragraphs?.[paragraphIndex + 1] : undefined;

	// Handle approve action
	const handleApprove = useCallback(async () => {
		setIsProcessing(true);
		setError(null);

		try {
			await approveReplacement(
				queueItem.queueId,
				isEdited ? editedText : undefined,
				adminNotes || undefined
			);
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : t('Failed to approve'));
			setIsProcessing(false);
		}
	}, [approveReplacement, queueItem.queueId, isEdited, editedText, adminNotes, onClose, t]);

	// Handle reject action
	const handleReject = useCallback(async () => {
		if (!adminNotes.trim()) {
			setError(t('Please provide a reason for rejection'));
			return;
		}

		setIsProcessing(true);
		setError(null);

		try {
			await rejectReplacement(queueItem.queueId, adminNotes);
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : t('Failed to reject'));
			setIsProcessing(false);
		}
	}, [rejectReplacement, queueItem.queueId, adminNotes, onClose, t]);

	// Handle action confirmation
	const handleConfirmAction = useCallback(() => {
		if (pendingAction === 'approve') {
			handleApprove();
		} else if (pendingAction === 'reject') {
			handleReject();
		}
		setPendingAction(null);
	}, [pendingAction, handleApprove, handleReject]);

	// Keyboard navigation
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				if (pendingAction) {
					setPendingAction(null);
				} else {
					onClose();
				}
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [onClose, pendingAction]);

	// Focus trap
	useEffect(() => {
		const modal = document.getElementById('review-modal');
		if (modal) {
			const firstFocusable = modal.querySelector<HTMLElement>('button, [tabindex]:not([tabindex="-1"])');
			firstFocusable?.focus();
		}
	}, []);

	return (
		<div
			className={styles.overlay}
			onClick={onClose}
			role="dialog"
			aria-modal="true"
			aria-labelledby="modal-title"
		>
			<div
				id="review-modal"
				className={styles.modal}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<header className={styles.modal__header}>
					<div className={styles.modal__headerContent}>
						<h2 id="modal-title" className={styles.modal__title}>
							{t('Review Suggestion')}
						</h2>
						{documentTitle && (
							<span className={styles.modal__documentTitle}>
								{documentTitle}
							</span>
						)}
					</div>

					<div className={styles.modal__headerActions}>
						<button
							type="button"
							onClick={onClose}
							className={styles.modal__close}
							aria-label={t('Close')}
						>
							<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<line x1="18" y1="6" x2="6" y2="18" />
								<line x1="6" y1="6" x2="18" y2="18" />
							</svg>
						</button>
					</div>
				</header>

				{/* Status Bar */}
				<div className={styles.modal__statusBar}>
					<div className={styles.modal__consensusInfo}>
						<div className={styles.modal__consensusBadge}>
							<span className={styles.modal__consensusValue}>
								{Math.round(queueItem.consensus * 100)}%
							</span>
							<span className={styles.modal__consensusLabel}>
								{t('consensus')}
							</span>
						</div>

						{consensusDrop !== 0 && (
							<div className={`${styles.modal__consensusChange} ${isStale ? styles['modal__consensusChange--warning'] : ''}`}>
								{consensusDrop > 0 ? (
									<>
										<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
											<path d="M7 14l5 5 5-5H7z" />
										</svg>
										{Math.round(consensusDrop * 100)}% {t('since submitted')}
									</>
								) : (
									<>
										<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
											<path d="M7 10l5-5 5 5H7z" />
										</svg>
										+{Math.round(Math.abs(consensusDrop) * 100)}% {t('since submitted')}
									</>
								)}
							</div>
						)}
					</div>

					<div className={styles.modal__metaInfo}>
						<span className={styles.modal__metaItem}>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
								<circle cx="9" cy="7" r="4" />
							</svg>
							{queueItem.evaluationCount} {t('votes')}
						</span>
						<span className={styles.modal__metaItem}>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
								<circle cx="12" cy="7" r="4" />
							</svg>
							{t('by')} {queueItem.creatorDisplayName || t('Anonymous')}
						</span>
					</div>
				</div>

				{/* View Mode Tabs */}
				<nav className={styles.modal__tabs} role="tablist">
					<button
						role="tab"
						aria-selected={viewMode === 'diff'}
						aria-controls="panel-diff"
						className={`${styles.modal__tab} ${viewMode === 'diff' ? styles['modal__tab--active'] : ''}`}
						onClick={() => setViewMode('diff')}
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<path d="M12 20V10" />
							<path d="M18 20V4" />
							<path d="M6 20v-4" />
						</svg>
						{t('Inline Diff')}
					</button>

					<button
						role="tab"
						aria-selected={viewMode === 'sideBySide'}
						aria-controls="panel-sideBySide"
						className={`${styles.modal__tab} ${viewMode === 'sideBySide' ? styles['modal__tab--active'] : ''}`}
						onClick={() => setViewMode('sideBySide')}
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<rect x="3" y="3" width="7" height="18" rx="1" />
							<rect x="14" y="3" width="7" height="18" rx="1" />
						</svg>
						{t('Side by Side')}
					</button>

					<button
						role="tab"
						aria-selected={viewMode === 'context'}
						aria-controls="panel-context"
						className={`${styles.modal__tab} ${viewMode === 'context' ? styles['modal__tab--active'] : ''}`}
						onClick={() => setViewMode('context')}
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
							<polyline points="14,2 14,8 20,8" />
							<line x1="16" y1="13" x2="8" y2="13" />
							<line x1="16" y1="17" x2="8" y2="17" />
						</svg>
						{t('Document Context')}
					</button>
				</nav>

				{/* Content Area */}
				<div className={styles.modal__content}>
					{/* Diff View */}
					{viewMode === 'diff' && (
						<div id="panel-diff" role="tabpanel" className={styles.modal__panel}>
							<DiffView
								currentText={stripHtml(queueItem.currentText)}
								proposedText={settings.allowAdminEdit ? editedText : originalProposedText}
								mode="inline"
								highlightWords={true}
							/>
						</div>
					)}

					{/* Side by Side View */}
					{viewMode === 'sideBySide' && (
						<div id="panel-sideBySide" role="tabpanel" className={styles.modal__panel}>
							<DiffView
								currentText={stripHtml(queueItem.currentText)}
								proposedText={settings.allowAdminEdit ? editedText : originalProposedText}
								mode="sideBySide"
								showLineNumbers={true}
							/>
						</div>
					)}

					{/* Context View */}
					{viewMode === 'context' && (
						<div id="panel-context" role="tabpanel" className={styles.modal__panel}>
							<DocumentContextPanel
								currentParagraph={currentParagraph}
								prevParagraph={prevParagraph}
								nextParagraph={nextParagraph}
								proposedText={settings.allowAdminEdit ? editedText : originalProposedText}
								paragraphNumber={paragraphIndex + 1}
								onNavigate={onNavigateToContext}
							/>
						</div>
					)}

					{/* Admin Edit Section */}
					{settings.allowAdminEdit && (
						<div className={styles.modal__editSection}>
							<div className={styles.modal__editHeader}>
								<h4 className={styles.modal__editTitle}>
									{t('Edit Before Approval')}
									{isEdited && (
										<span className={styles.modal__editBadge}>
											{t('Modified')}
										</span>
									)}
								</h4>
								{isEdited && (
									<button
										type="button"
										onClick={() => setEditedText(originalProposedText)}
										className={styles.modal__resetButton}
									>
										{t('Reset to Original')}
									</button>
								)}
							</div>
							<textarea
								value={editedText}
								onChange={(e) => setEditedText(e.target.value)}
								className={styles.modal__textarea}
								rows={6}
								aria-label={t('Edit proposed text')}
							/>
						</div>
					)}

					{/* Admin Notes */}
					<div className={styles.modal__notesSection}>
						<label htmlFor="admin-notes" className={styles.modal__notesLabel}>
							{t('Admin Notes')}
							<span className={styles.modal__notesHint}>
								{t('Optional for approval, required for rejection')}
							</span>
						</label>
						<textarea
							id="admin-notes"
							value={adminNotes}
							onChange={(e) => setAdminNotes(e.target.value)}
							placeholder={t('Add any notes about this decision...')}
							className={styles.modal__textarea}
							rows={3}
						/>
					</div>

					{/* Error Message */}
					{error && (
						<div className={styles.modal__error} role="alert">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<circle cx="12" cy="12" r="10" />
								<line x1="12" y1="8" x2="12" y2="12" />
								<line x1="12" y1="16" x2="12.01" y2="16" />
							</svg>
							{error}
						</div>
					)}
				</div>

				{/* Actions Footer */}
				<footer className={styles.modal__footer}>
					<div className={styles.modal__impactPreview}>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<circle cx="12" cy="12" r="10" />
							<line x1="12" y1="16" x2="12" y2="12" />
							<line x1="12" y1="8" x2="12.01" y2="8" />
						</svg>
						<span>
							{tWithParams('Approving will update paragraph {{number}} in the document', {
								number: paragraphIndex + 1 || '?',
							})}
						</span>
					</div>

					<div className={styles.modal__actions}>
						<button
							type="button"
							onClick={() => setPendingAction('reject')}
							disabled={isProcessing}
							className={styles.modal__actionReject}
						>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<line x1="18" y1="6" x2="6" y2="18" />
								<line x1="6" y1="6" x2="18" y2="18" />
							</svg>
							{t('Reject')}
						</button>

						<button
							type="button"
							onClick={() => setPendingAction('approve')}
							disabled={isProcessing}
							className={styles.modal__actionApprove}
						>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<polyline points="20,6 9,17 4,12" />
							</svg>
							{isEdited ? t('Approve with Edits') : t('Approve')}
						</button>
					</div>
				</footer>
			</div>

			{/* Confirmation Dialog */}
			{pendingAction && (
				<ActionConfirmation
					action={pendingAction}
					isProcessing={isProcessing}
					hasNotes={!!adminNotes.trim()}
					isEdited={isEdited}
					onConfirm={handleConfirmAction}
					onCancel={() => setPendingAction(null)}
				/>
			)}
		</div>
	);
}
