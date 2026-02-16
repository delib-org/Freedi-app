import React, { FC, useState, useEffect, useCallback } from 'react';
import Modal from '@/view/components/modal/Modal';
import { Statement } from '@freedi/shared-types';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { getParagraphsText } from '@/utils/paragraphUtils';
import {
	requestProposalImprovement,
	applyImprovement,
} from '@/controllers/db/popperHebbian/improveProposalController';
import {
	ImproveProposalModalState,
	StatementVersion,
	getLoadingMessages,
} from '@/models/popperHebbian';
import DiffView from './DiffView';
import VersionHistory from './VersionHistory';
import styles from './ImproveProposalModal.module.scss';

interface ImproveProposalModalProps {
	statement: Statement & { versions?: StatementVersion[]; currentVersion?: number };
	onClose: () => void;
	onSuccess?: () => void;
}

const ImproveProposalModal: FC<ImproveProposalModalProps> = ({ statement, onClose, onSuccess }) => {
	const { user } = useAuthentication();
	const { t, currentLanguage } = useTranslation();

	const [modalState, setModalState] = useState<ImproveProposalModalState>({
		status: 'idle',
	});
	const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
	const [showVersionHistory, setShowVersionHistory] = useState(false);

	const loadingMessages = getLoadingMessages(currentLanguage);

	// Rotate loading messages
	useEffect(() => {
		if (modalState.status !== 'loading') return;

		const interval = setInterval(() => {
			setLoadingMessageIndex((prev) => (prev + 1) % loadingMessages.length);
		}, 2500);

		return () => clearInterval(interval);
	}, [modalState.status, loadingMessages.length]);

	// Request improvement on mount
	useEffect(() => {
		const fetchImprovement = async (): Promise<void> => {
			setModalState({
				status: 'loading',
				message: loadingMessages[0],
			});

			try {
				const response = await requestProposalImprovement(statement.statementId, currentLanguage);
				setModalState({ status: 'preview', data: response });
			} catch (error) {
				console.error('Failed to get AI improvement:', error);
				setModalState({
					status: 'error',
					error: t('Failed to generate improvement. Please try again.'),
				});
			}
		};

		fetchImprovement();
	}, [statement.statementId, currentLanguage, t, loadingMessages]);

	// Update loading message when index changes
	useEffect(() => {
		if (modalState.status === 'loading') {
			setModalState(
				(prev) =>
					({
						...prev,
						message: loadingMessages[loadingMessageIndex],
					}) as ImproveProposalModalState,
			);
		}
	}, [loadingMessageIndex, loadingMessages, modalState.status]);

	const handleApply = useCallback(async (): Promise<void> => {
		if (modalState.status !== 'preview' || !user) return;

		setModalState({ status: 'applying' });

		try {
			const paragraphsText = getParagraphsText(statement.paragraphs);
			await applyImprovement(
				statement.statementId,
				statement.statement,
				paragraphsText,
				modalState.data.improvedTitle,
				modalState.data.improvedDescription,
				modalState.data.improvementSummary,
				statement.currentVersion || 0,
			);

			setModalState({ status: 'success' });
			setTimeout(() => {
				onSuccess?.();
				onClose();
			}, 1500);
		} catch (error) {
			console.error('Failed to apply improvement:', error);
			setModalState({
				status: 'error',
				error: t('Failed to apply improvement. Please try again.'),
			});
		}
	}, [modalState, user, statement, onSuccess, onClose, t]);

	const handleRetry = useCallback(async (): Promise<void> => {
		setModalState({
			status: 'loading',
			message: loadingMessages[0],
		});
		setLoadingMessageIndex(0);

		try {
			const response = await requestProposalImprovement(statement.statementId, currentLanguage);
			setModalState({ status: 'preview', data: response });
		} catch (error) {
			console.error('Failed to get AI improvement:', error);
			setModalState({
				status: 'error',
				error: t('Failed to generate improvement. Please try again.'),
			});
		}
	}, [statement.statementId, currentLanguage, loadingMessages, t]);

	const renderContent = (): React.ReactNode => {
		switch (modalState.status) {
			case 'idle':
			case 'loading':
				return (
					<div className={styles.loadingState}>
						<div className={styles.spinner} />
						<p className={styles.loadingMessage}>
							{modalState.status === 'loading' ? modalState.message : loadingMessages[0]}
						</p>
					</div>
				);

			case 'error':
				return (
					<div className={styles.errorState}>
						<div className={styles.errorIcon}>!</div>
						<p className={styles.errorMessage}>{modalState.error}</p>
						<button className={styles.retryButton} onClick={handleRetry}>
							{t('Try Again')}
						</button>
					</div>
				);

			case 'preview':
				return (
					<div className={styles.previewState}>
						<div className={styles.comparisonSection}>
							<h4 className={styles.sectionTitle}>{t('Title')}</h4>
							<DiffView
								original={modalState.data.originalTitle}
								improved={modalState.data.improvedTitle}
							/>
						</div>

						<div className={styles.comparisonSection}>
							<h4 className={styles.sectionTitle}>{t('Description')}</h4>
							<DiffView
								original={modalState.data.originalDescription || t('No description')}
								improved={modalState.data.improvedDescription}
							/>
						</div>

						<div className={styles.changesSection}>
							<h4 className={styles.changesSectionTitle}>{t('What Changed')}</h4>
							<ul className={styles.changesList}>
								{modalState.data.changesHighlight.map((change, index) => (
									<li key={index} className={styles.changeItem}>
										{change}
									</li>
								))}
							</ul>
							<p className={styles.summary}>{modalState.data.improvementSummary}</p>
							<div className={styles.metadata}>
								<span className={styles.evidenceCount}>
									{t('Based on {{count}} comments').replace(
										'{{count}}',
										String(modalState.data.evidenceConsidered),
									)}
								</span>
								<span className={styles.confidence}>
									{t('Confidence')}: {Math.round(modalState.data.confidence * 100)}%
								</span>
							</div>
						</div>
					</div>
				);

			case 'applying':
				return (
					<div className={styles.applyingState}>
						<div className={styles.spinner} />
						<p>{t('Applying improvement...')}</p>
					</div>
				);

			case 'success':
				return (
					<div className={styles.successState}>
						<div className={styles.successIcon}>&#10003;</div>
						<p>{t('Improvement applied successfully!')}</p>
					</div>
				);

			default:
				return null;
		}
	};

	const showFooterButtons = modalState.status === 'preview';

	return (
		<Modal closeModal={onClose} title={t('AI-Improved Version')}>
			<div className={styles.modalContainer}>
				<div className={styles.modalHeader}>
					<h2 className={styles.modalTitle}>{t('AI-Improved Version')}</h2>
					<button className={styles.closeButton} onClick={onClose} aria-label={t('Close modal')}>
						&times;
					</button>
				</div>

				<div className={styles.modalBody}>{renderContent()}</div>

				{showFooterButtons && (
					<div className={styles.modalFooter}>
						<button className={styles.discardButton} onClick={onClose}>
							{t('Discard')}
						</button>

						{statement.versions && statement.versions.length > 0 && (
							<button className={styles.historyButton} onClick={() => setShowVersionHistory(true)}>
								{t('Version History')}
							</button>
						)}

						<button className={styles.applyButton} onClick={handleApply}>
							{t('Apply Improvement')}
						</button>
					</div>
				)}
			</div>

			{showVersionHistory && statement.versions && (
				<VersionHistory
					versions={statement.versions}
					currentVersion={statement.currentVersion || 0}
					statementId={statement.statementId}
					onClose={() => setShowVersionHistory(false)}
					onRevert={() => {
						setShowVersionHistory(false);
						onClose();
					}}
				/>
			)}
		</Modal>
	);
};

export default ImproveProposalModal;
