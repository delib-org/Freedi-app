import React, { FormEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useReadVisibleNotifications } from '@/controllers/hooks/useReadVisibleNotifications';
import { listenToSubStatements } from '@/controllers/db/statements/listenToStatements';
import { statementSelector, statementSubsSelector } from '@/redux/statements/statementsSlice';
import { inAppNotificationsSelector } from '@/redux/notificationsSlice/notificationsSlice';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { handleAddStatement } from '@/view/pages/statement/components/chat/components/input/StatementInputCont';
import { useDialogBehaviour } from '../Modal/useDialogBehaviour';
import AnswerChatMessage from './AnswerChatMessage';
import styles from './AnswerChatSheet.module.scss';

/**
 * AnswerChatSheet Molecule
 *
 * The thread under one answer, opened from its שיחה pill as a 78%-height bottom
 * sheet (a centred dialog from tablet up). Uses the same data path as the chat
 * page: `listenToSubStatements` for the messages, `handleAddStatement` to post,
 * and `useReadVisibleNotifications` so messages seen in the sheet clear the
 * pill's unread badge exactly as they would on the chat page.
 */

export interface AnswerChatSheetProps {
	isOpen: boolean;
	onClose: () => void;
	answerId: string;
	/** Shown as the sheet title. */
	answerText: string;
}

const AnswerChatSheet: React.FC<AnswerChatSheetProps> = ({ isOpen, ...rest }) => {
	// Listeners only run while open, so a list of cards costs nothing.
	if (!isOpen) return null;

	return <AnswerChatSheetPanel {...rest} />;
};

type PanelProps = Omit<AnswerChatSheetProps, 'isOpen'>;

const AnswerChatSheetPanel: React.FC<PanelProps> = ({ onClose, answerId, answerText }) => {
	const { t, dir } = useTranslation();
	const titleId = `${useId()}-answer-chat-title`;
	const panelRef = useRef<HTMLDivElement>(null);
	const [listElement, setListElement] = useState<HTMLDivElement | null>(null);
	const [draft, setDraft] = useState('');

	useDialogBehaviour({ isOpen: true, onClose, panelRef, trapFocus: true });

	useEffect(() => {
		const unsubscribe = listenToSubStatements(answerId);

		return () => unsubscribe();
	}, [answerId]);

	const selectMessages = useMemo(() => statementSubsSelector(answerId), [answerId]);
	const selectAnswer = useMemo(() => statementSelector(answerId), [answerId]);
	const messages = useAppSelector(selectMessages);
	const answer = useAppSelector(selectAnswer);
	const notifications = useAppSelector(inAppNotificationsSelector);
	const creator = useAppSelector(creatorSelector);

	useReadVisibleNotifications(listElement, answerId);

	// Messages still carrying an unread notification get the "· new" marker.
	const unreadMessageIds = useMemo(
		() =>
			new Set(
				notifications
					.filter((n) => n.parentId === answerId && !n.read && n.creatorId !== creator?.uid)
					.map((n) => n.statementId),
			),
		[notifications, answerId, creator?.uid],
	);

	// Keep the newest message in view as the thread grows.
	useEffect(() => {
		if (listElement) listElement.scrollTop = listElement.scrollHeight;
	}, [listElement, messages.length]);

	const canSend = draft.trim().length > 0 && !!answer;

	const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
		event.preventDefault();
		if (!canSend || !answer) return;
		handleAddStatement(draft, answer);
		setDraft('');
	};

	return createPortal(
		<div className={styles.root} dir={dir} role="presentation">
			<div className={styles.backdrop} onClick={onClose} data-testid="answer-chat-sheet-backdrop" />
			<div
				ref={panelRef}
				className={styles.panel}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				tabIndex={-1}
				data-testid="answer-chat-sheet"
			>
				<div className={styles.handle} aria-hidden="true" />
				<div className={styles.header}>
					<div className={styles.heading}>
						<span className={styles.eyebrow}>{t('Conversation about the answer')}</span>
						<h2 id={titleId} className={styles.title} dir="auto">
							{answerText}
						</h2>
					</div>
					<button
						type="button"
						className={styles.close}
						onClick={onClose}
						data-testid="answer-chat-sheet-close"
					>
						{t('Close')}
					</button>
				</div>
				<div className={styles.list} ref={setListElement}>
					{messages.length === 0 ? (
						<p className={styles.empty}>{t('No messages')}</p>
					) : (
						messages.map((message) => (
							<AnswerChatMessage
								key={message.statementId}
								message={message}
								isNew={unreadMessageIds.has(message.statementId)}
							/>
						))
					)}
				</div>
				<form className={styles.composer} onSubmit={handleSubmit}>
					<input
						className={styles.input}
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						placeholder={t('Add to the conversation about the answer…')}
						aria-label={t('Add to the conversation about the answer…')}
						data-testid="answer-chat-sheet-input"
					/>
					<button
						type="submit"
						className={styles.send}
						disabled={!canSend}
						aria-label={t('Send')}
						data-testid="answer-chat-sheet-send"
					>
						<svg
							className={styles.sendIcon}
							width="18"
							height="18"
							viewBox="0 0 20 20"
							fill="none"
							aria-hidden="true"
						>
							<path
								d="M16 10H4M9 5l-5 5 5 5"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					</button>
				</form>
			</div>
		</div>,
		document.body,
	);
};

export default AnswerChatSheet;
