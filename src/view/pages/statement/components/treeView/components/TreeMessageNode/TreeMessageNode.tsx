import React, { FC, useMemo, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { handleAddStatement } from '@/view/pages/statement/components/chat/components/input/StatementInputCont';
import { logError } from '@/utils/errorHandling';
import UserAvatar from '@/view/pages/statement/components/chat/components/userAvatar/UserAvatar';
import SendIcon from '@/view/components/icons/SendIcon';
import styles from './TreeMessageNode.module.scss';

interface TreeMessageNodeProps {
	statement: Statement;
	hasChildren: boolean;
}

function formatMessageTime(timestamp: number): string {
	const date = new Date(timestamp);

	return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const TreeMessageNode: FC<TreeMessageNodeProps> = ({ statement, hasChildren }) => {
	const navigate = useNavigate();
	const { t } = useTranslation();
	const timeString = useMemo(() => formatMessageTime(statement.createdAt), [statement.createdAt]);

	const [showReplyInput, setShowReplyInput] = useState(false);
	const [replyText, setReplyText] = useState('');
	const replyInputRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		if (showReplyInput && replyInputRef.current) {
			replyInputRef.current.focus();
		}
	}, [showReplyInput]);

	const adjustTextareaHeight = () => {
		if (replyInputRef.current) {
			replyInputRef.current.style.height = 'auto';
			replyInputRef.current.style.height = `${replyInputRef.current.scrollHeight}px`;
		}
	};

	const handleDrillDown = () => {
		navigate(`/statement/${statement.statementId}`);
	};

	const handleReplyToggle = () => {
		setShowReplyInput((prev) => !prev);
		setReplyText('');
	};

	const handleReplySubmit = (
		e: React.FormEvent<HTMLFormElement> | React.KeyboardEvent<HTMLTextAreaElement>,
	) => {
		e.preventDefault();
		if (!replyText.trim()) return;

		try {
			handleAddStatement(replyText, statement);
			setReplyText('');
			setShowReplyInput(false);
		} catch (error) {
			logError(error, {
				operation: 'TreeMessageNode.handleReplySubmit',
				statementId: statement.statementId,
			});
		}
	};

	const handleReplyKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Escape') {
			setShowReplyInput(false);
			setReplyText('');

			return;
		}

		const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
			navigator.userAgent,
		);

		if (e.key === 'Enter' && !e.shiftKey && !isMobile) {
			handleReplySubmit(e);
		}
	};

	return (
		<div className={styles['tree-message-node']}>
			<div className={styles['tree-message-node__avatar']}>
				<UserAvatar user={statement.creator} />
			</div>
			<div className={styles['tree-message-node__body']}>
				<div className={styles['tree-message-node__header']}>
					<span className={styles['tree-message-node__author']}>
						{statement.creator.displayName}
					</span>
					<span className={styles['tree-message-node__time']}>{timeString}</span>
				</div>
				<div className={styles['tree-message-node__text']}>{statement.statement}</div>
				<div className={styles['tree-message-node__actions']}>
					<button
						className={styles['tree-message-node__action-btn']}
						onClick={handleReplyToggle}
						aria-label={t('reply')}
					>
						{t('reply')}
					</button>
					{hasChildren && (
						<button
							className={styles['tree-message-node__action-btn']}
							onClick={handleDrillDown}
							aria-label={t('Drill down')}
						>
							{t('Drill down')}
						</button>
					)}
				</div>

				{showReplyInput && (
					<form className={styles['tree-message-node__reply-form']} onSubmit={handleReplySubmit}>
						<textarea
							ref={replyInputRef}
							className={styles['tree-message-node__reply-input']}
							value={replyText}
							onChange={(e) => {
								setReplyText(e.target.value);
								adjustTextareaHeight();
							}}
							onInput={adjustTextareaHeight}
							onKeyUp={handleReplyKeyUp}
							placeholder={t('Type your message here...')}
							rows={2}
							required
						/>
						<button
							type="submit"
							className={styles['tree-message-node__reply-send']}
							aria-label={t('Send')}
						>
							<SendIcon color="var(--btn-primary, #5f88e5)" />
						</button>
					</form>
				)}
			</div>
		</div>
	);
};

export default TreeMessageNode;
