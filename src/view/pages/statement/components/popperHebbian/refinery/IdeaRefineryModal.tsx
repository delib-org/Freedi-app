import React, { FC, useState, useEffect, useRef } from 'react';
import Modal from '@/view/components/modal/Modal';
import RefinementMessage from './RefinementMessage';
import { RefinementSession, IdeaRefinementStatus } from '@/models/popperHebbian/RefineryModels';
import {
	startRefinementSession,
	submitRefinementResponse,
	publishRefinedIdea,
} from '@/controllers/db/popperHebbian/refineryController';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './IdeaRefineryModal.module.scss';
import { logError } from '@/utils/errorHandling';

interface IdeaRefineryModalProps {
	parentStatementId: string;
	originalIdea: string;
	onClose: () => void;
	onPublish: (refinedIdea: string, sessionId: string) => void;
}

const IdeaRefineryModal: FC<IdeaRefineryModalProps> = ({
	parentStatementId,
	originalIdea,
	onClose,
	onPublish,
}) => {
	const { user } = useAuthentication();
	const { t, currentLanguage } = useTranslation();
	const [session, setSession] = useState<RefinementSession | null>(null);
	const [userInput, setUserInput] = useState('');
	const [isProcessing, setIsProcessing] = useState(false);
	const [isInitializing, setIsInitializing] = useState(true);
	const messagesEndRef = useRef<HTMLDivElement>(null);

	const scrollToBottom = (): void => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	};

	useEffect(() => {
		scrollToBottom();
	}, [session?.conversationHistory]);

	useEffect(() => {
		const initializeSession = async (): Promise<void> => {
			if (!user) return;

			setIsInitializing(true);

			try {
				const newSession = await startRefinementSession(
					parentStatementId,
					originalIdea,
					user.uid,
					currentLanguage,
				);

				setSession(newSession);
			} catch (error) {
				logError(error, { operation: 'refinery.IdeaRefineryModal.initializeSession', metadata: { message: 'Error initializing refinement session:' } });
			} finally {
				setIsInitializing(false);
			}
		};

		initializeSession();
	}, [parentStatementId, originalIdea, user]);

	const handleSubmitResponse = async (): Promise<void> => {
		if (!session || !userInput.trim() || !user) return;

		setIsProcessing(true);

		try {
			const updatedSession = await submitRefinementResponse(
				session.sessionId,
				userInput.trim(),
				currentLanguage,
			);

			setSession(updatedSession);
			setUserInput('');
		} catch (error) {
			logError(error, { operation: 'refinery.IdeaRefineryModal.handleSubmitResponse', metadata: { message: 'Error submitting response:' } });
		} finally {
			setIsProcessing(false);
		}
	};

	const handlePublish = async (): Promise<void> => {
		if (!session) return;

		setIsProcessing(true);

		try {
			await publishRefinedIdea(session.sessionId);
			onPublish(session.refinedIdea, session.sessionId);
			onClose();
		} catch (error) {
			logError(error, { operation: 'refinery.IdeaRefineryModal.handlePublish', metadata: { message: 'Error publishing refined idea:' } });
			setIsProcessing(false);
		}
	};

	const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSubmitResponse();
		}
	};

	const isReadyForDiscussion = session?.status === IdeaRefinementStatus.readyForDiscussion;

	return (
		<Modal closeModal={onClose} title={t('AI Idea Refinery')}>
			<div className={styles.refineryModal}>
				<div className={styles.modalHeader}>
					<div className={styles.headerContent}>
						<h2 className={styles.modalTitle}>🤖 {t('AI Idea Refinery')}</h2>
						<p className={styles.modalSubtitle}>{t('Making your idea testable and falsifiable')}</p>
					</div>
					<button className={styles.closeButton} onClick={onClose} aria-label="Close modal">
						×
					</button>
				</div>

				<div className={styles.originalIdeaSection}>
					<h4 className={styles.sectionTitle}>{t('Original Idea')}</h4>
					<div className={styles.originalIdea}>{originalIdea}</div>
				</div>

				<div className={styles.conversationSection}>
					{isInitializing ? (
						<div className={styles.loadingState}>
							<div className={styles.loadingSpinner} />
							<p>{t('Starting AI analysis...')}</p>
						</div>
					) : (
						<>
							<div className={styles.messagesContainer}>
								{session?.conversationHistory.map((message) => (
									<RefinementMessage
										key={message.messageId}
										role={message.role === 'ai-guide' ? 'ai' : 'user'}
										content={message.content}
										timestamp={message.timestamp}
									/>
								))}
								<div ref={messagesEndRef} />
							</div>

							{isReadyForDiscussion ? (
								<div className={styles.completionSection}>
									<div className={styles.completionBadge}>✓ {t('Idea is Ready!')}</div>
									<div className={styles.refinedIdeaDisplay}>
										<h4 className={styles.refinedTitle}>{t('Refined Idea')}</h4>
										<p className={styles.refinedText}>{session.refinedIdea}</p>
									</div>
									<button
										className={styles.publishButton}
										onClick={handlePublish}
										disabled={isProcessing}
									>
										{isProcessing ? t('Publishing...') : t('Publish to Discussion')}
									</button>
								</div>
							) : (
								<div className={styles.inputSection}>
									<textarea
										className={styles.userInput}
										value={userInput}
										onChange={(e) => setUserInput(e.target.value)}
										onKeyPress={handleKeyPress}
										placeholder={t('Type your response... (Shift+Enter for new line)')}
										rows={3}
										disabled={isProcessing}
									/>
									<div className={styles.inputActions}>
										<button
											className={styles.sendButton}
											onClick={handleSubmitResponse}
											disabled={!userInput.trim() || isProcessing}
										>
											{isProcessing ? t('Thinking...') : t('Send')} →
										</button>
									</div>
								</div>
							)}
						</>
					)}
				</div>
			</div>
		</Modal>
	);
};

export default IdeaRefineryModal;
