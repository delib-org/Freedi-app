import React, { FC, useState, useEffect, useRef } from 'react';
import styles from './ChatInput.module.scss';
import { logError } from '@/utils/errorHandling';
import { handleAddStatement } from './StatementInputCont';
import SendIcon from '@/view/components/icons/SendIcon';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import EnhancedEvaluation from '../../../evaluations/components/evaluation/enhancedEvaluation/EnhancedEvaluation';
import { getCreatorDisplayName } from '@/helpers/getCreatorDisplayName';

interface Props {
	statement: Statement;
	hasEvaluation?: boolean;
	sideChat?: boolean;
	replyToStatement?: Statement | null;
	onClearReply?: () => void;
	/** When true, reply is created as a child of replyToStatement (tree threading) */
	replyAsChild?: boolean;
}

const ChatInput: FC<Props> = ({
	statement,
	hasEvaluation,
	sideChat = false,
	replyToStatement,
	onClearReply,
	replyAsChild = false,
}) => {
	if (!statement) throw new Error('No statement');

	const { t, dir } = useTranslation();
	const [message, setMessage] = useState('');
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Auto-focus when reply-to is set
	useEffect(() => {
		if (replyToStatement && textareaRef.current) {
			textareaRef.current.focus();
		}
	}, [replyToStatement]);

	const adjustTextareaHeight = () => {
		if (textareaRef.current) {
			textareaRef.current.style.height = 'auto';
			textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
		}
	};

	function handleKeyUp(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		try {
			const _isMobile = !!/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
				navigator.userAgent,
			);

			if (e.key === 'Enter' && !e.shiftKey && !_isMobile && !e.nativeEvent.isComposing) {
				handleSubmitInput(e);
			}
		} catch (error) {
			logError(error, { operation: 'input.ChatInput.handleKeyUp' });
		}
	}

	const handleSubmitInput = (
		e: React.FormEvent<HTMLFormElement> | React.KeyboardEvent<HTMLTextAreaElement>,
	) => {
		e.preventDefault();
		if (!message.trim()) return;

		if (replyAsChild && replyToStatement) {
			// Tree view: create reply as child of the replied-to message
			handleAddStatement(message, replyToStatement);
		} else {
			// Chat view: flat message with replyTo reference
			handleAddStatement(message, statement, replyToStatement);
		}

		setMessage('');
		onClearReply?.();
		if (textareaRef.current) {
			textareaRef.current.style.height = 'auto';
		}
	};

	return (
		<div className={sideChat ? styles.sideChatInput : styles.chatInput}>
			{hasEvaluation && (
				<div className={styles.eval}>
					<EnhancedEvaluation statement={statement} hideFaceLabels />
				</div>
			)}
			{replyToStatement && (
				<div className={styles.replyIndicator}>
					<div className={styles.replyIndicatorContent}>
						<span className={styles.replyIndicatorAuthor}>
							{t('Replying to')} {getCreatorDisplayName(replyToStatement)}
						</span>
						<span className={styles.replyIndicatorText}>
							{replyToStatement.statement.slice(0, 80)}
							{replyToStatement.statement.length > 80 ? '...' : ''}
						</span>
					</div>
					<button
						type="button"
						className={styles.replyIndicatorClose}
						onClick={onClearReply}
						aria-label={t('Cancel')}
					>
						<span className="material-symbols-outlined" style={{ fontSize: 18 }}>
							close
						</span>
					</button>
				</div>
			)}
			<form className={styles.form} dir={dir} onSubmit={(e) => handleSubmitInput(e)} name="theForm">
				<textarea
					className={styles.textarea}
					data-cy="statement-chat-input"
					aria-label={t('Share a thought')}
					name="newStatement"
					rows={1}
					ref={textareaRef}
					onKeyUp={(e) => handleKeyUp(e)}
					value={message}
					onInput={adjustTextareaHeight}
					onChange={(e) => {
						setMessage(e.target.value);
						adjustTextareaHeight();
					}}
					required
					placeholder={t('Write a message…')}
				></textarea>
				<button
					type="submit"
					className={styles.send}
					aria-label={t('Send message')}
					disabled={!message.trim()}
					data-cy="statement-chat-send-btn"
				>
					<SendIcon color="currentColor" />
				</button>
			</form>
		</div>
	);
};

export default ChatInput;
