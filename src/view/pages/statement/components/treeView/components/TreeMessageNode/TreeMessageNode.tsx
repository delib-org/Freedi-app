import React, { FC, useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Statement, StatementType } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSubscriptionSelector } from '@/redux/statements/statementsSlice';
import { isAuthorized } from '@/controllers/general/helpers';
import { changeStatementType } from '@/controllers/db/statements/changeStatementType';
import { handleAddStatement } from '@/view/pages/statement/components/chat/components/input/StatementInputCont';
import { logError } from '@/utils/errorHandling';
import UserAvatar from '@/view/pages/statement/components/chat/components/userAvatar/UserAvatar';
import EditableStatement from '@/view/components/edit/EditableStatement';
import ChatMessageMenu from '@/view/pages/statement/components/chat/components/chatMessageCard/ChatMessageMenu';
import SendIcon from '@/view/components/icons/SendIcon';
import styles from './TreeMessageNode.module.scss';

interface TreeMessageNodeProps {
	statement: Statement;
	parentStatement: Statement | undefined;
	hasChildren: boolean;
	onReplySubmitted?: () => void;
}

const SWIPE_THRESHOLD = 60;

function formatMessageTime(timestamp: number): string {
	const date = new Date(timestamp);

	return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const TreeMessageNode: FC<TreeMessageNodeProps> = ({
	statement,
	parentStatement,
	hasChildren,
	onReplySubmitted,
}) => {
	const navigate = useNavigate();
	const { t } = useTranslation();
	const { dir } = useUserConfig();
	const statementSubscription = useAppSelector(statementSubscriptionSelector(statement.parentId));
	const timeString = useMemo(() => formatMessageTime(statement.createdAt), [statement.createdAt]);

	const _isAuthorized = isAuthorized(
		statement,
		statementSubscription,
		parentStatement?.creator?.uid,
	);

	const [showReplyInput, setShowReplyInput] = useState(false);
	const [replyText, setReplyText] = useState('');
	const [isEdit, setIsEdit] = useState(false);
	const [isCardMenuOpen, setIsCardMenuOpen] = useState(false);
	const [swipeClass, setSwipeClass] = useState('');

	const replyInputRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const touchStartX = useRef<number | null>(null);

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
			onReplySubmitted?.();
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

	const handleSaveSuccess = useCallback(() => {
		setIsEdit(false);
	}, []);

	// Swipe gesture handlers
	const handleTouchStart = useCallback((e: React.TouchEvent) => {
		touchStartX.current = e.touches[0].clientX;
	}, []);

	const handleTouchEnd = useCallback(
		async (e: React.TouchEvent) => {
			if (touchStartX.current === null || !_isAuthorized) return;

			const deltaX = e.changedTouches[0].clientX - touchStartX.current;
			touchStartX.current = null;

			if (Math.abs(deltaX) < SWIPE_THRESHOLD) return;

			const isRTL = dir === 'rtl';
			// "With writing direction" = right in LTR, left in RTL
			const isSwipeWithWritingDir = isRTL ? deltaX < 0 : deltaX > 0;

			let newType: StatementType | null = null;

			if (isSwipeWithWritingDir) {
				// Swipe with writing direction → promote toward option
				if (statement.statementType === StatementType.statement) {
					newType = StatementType.option;
				} else if (statement.statementType === StatementType.question) {
					newType = StatementType.statement;
				}
			} else {
				// Swipe against writing direction → promote toward question
				if (statement.statementType === StatementType.statement) {
					newType = StatementType.question;
				} else if (statement.statementType === StatementType.option) {
					newType = StatementType.statement;
				}
			}

			if (!newType) return;

			// Visual feedback
			const feedbackClass = deltaX > 0 ? 'swiping-right' : 'swiping-left';
			setSwipeClass(feedbackClass);
			setTimeout(() => setSwipeClass(''), 400);

			try {
				const result = await changeStatementType(statement, newType, _isAuthorized);
				if (!result.success && result.error) {
					console.info(result.error);
				}
			} catch (error) {
				logError(error, {
					operation: 'TreeMessageNode.handleSwipe',
					statementId: statement.statementId,
				});
			}
		},
		[_isAuthorized, dir, statement],
	);

	const nodeClassName = [
		styles['tree-message-node'],
		swipeClass ? styles[`tree-message-node--${swipeClass}`] : '',
	]
		.filter(Boolean)
		.join(' ');

	return (
		<div className={nodeClassName} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
			<div className={styles['tree-message-node__avatar']}>
				<UserAvatar user={statement.creator} />
			</div>
			<div className={styles['tree-message-node__body']}>
				<div className={styles['tree-message-node__header']}>
					<span className={styles['tree-message-node__author']}>
						{statement.creator.displayName}
					</span>
					<span className={styles['tree-message-node__time']}>{timeString}</span>
					<div className={styles['tree-message-node__menu']}>
						<ChatMessageMenu
							statement={statement}
							parentStatement={parentStatement}
							isCardMenuOpen={isCardMenuOpen}
							setIsCardMenuOpen={setIsCardMenuOpen}
							isAuthorized={_isAuthorized}
							setIsEdit={setIsEdit}
							fileInputRef={fileInputRef as React.RefObject<HTMLInputElement>}
						/>
					</div>
				</div>
				{isEdit ? (
					<EditableStatement
						statement={statement}
						showDescription={false}
						forceEditable={true}
						forceEditing={true}
						onSaveSuccess={handleSaveSuccess}
					/>
				) : (
					<div className={styles['tree-message-node__text']}>{statement.statement}</div>
				)}
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

				{/* Hidden file input for image upload */}
				<input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} />
			</div>
		</div>
	);
};

export default TreeMessageNode;
