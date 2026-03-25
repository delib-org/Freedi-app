import React, { FC, useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Statement } from '@freedi/shared-types';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSubscriptionSelector } from '@/redux/statements/statementsSlice';
import { isAuthorized } from '@/controllers/general/helpers';
import { handleAddStatement } from '@/view/pages/statement/components/chat/components/input/StatementInputCont';
import { logError } from '@/utils/errorHandling';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import StatementTypeIcon from '../StatementTypeIcon/StatementTypeIcon';
import EditableStatement from '@/view/components/edit/EditableStatement';
import ChatMessageMenu from '@/view/pages/statement/components/chat/components/chatMessageCard/ChatMessageMenu';
import Evaluation from '@/view/pages/statement/components/evaluations/components/evaluation/Evaluation';
import SendIcon from '@/view/components/icons/SendIcon';
import styles from './TreeOptionNode.module.scss';

interface TreeOptionNodeProps {
	statement: Statement;
	parentStatement: Statement | undefined;
	onReplySubmitted?: () => void;
}

const TreeOptionNode: FC<TreeOptionNodeProps> = ({ statement, parentStatement, onReplySubmitted }) => {
	const navigate = useNavigate();
	const { t } = useTranslation();
	const statementSubscription = useAppSelector(statementSubscriptionSelector(statement.parentId));

	const _isAuthorized = isAuthorized(
		statement,
		statementSubscription,
		parentStatement?.creator?.uid,
	);

	const [isEdit, setIsEdit] = useState(false);
	const [isCardMenuOpen, setIsCardMenuOpen] = useState(false);
	const [showReplyInput, setShowReplyInput] = useState(false);
	const [replyText, setReplyText] = useState('');
	const fileInputRef = useRef<HTMLInputElement>(null);
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
				operation: 'TreeOptionNode.handleReplySubmit',
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

	const isInResults =
		parentStatement?.results?.some((result) => result.statementId === statement.statementId) ??
		false;

	const nodeClassName = [
		styles['tree-option-node'],
		isInResults ? styles['tree-option-node--selected'] : '',
	]
		.filter(Boolean)
		.join(' ');

	return (
		<div className={nodeClassName}>
			<div className={styles['tree-option-node__avatar']}>
				<StatementTypeIcon type={statement.statementType} isSelected={isInResults} />
			</div>
			<div className={styles['tree-option-node__body']}>
				<div className={styles['tree-option-node__header']}>
					<div className={styles['tree-option-node__menu']}>
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
					<div className={styles['tree-option-node__text']}>{statement.statement}</div>
				)}
				<div className={styles['tree-option-node__evaluation']}>
					<Evaluation statement={statement} />
				</div>
				<div className={styles['tree-option-node__actions']}>
					<button
						className={styles['tree-option-node__action-btn']}
						onClick={handleReplyToggle}
						aria-label={t('reply')}
					>
						{t('reply')}
					</button>
					<button
						className={styles['tree-option-node__action-btn']}
						onClick={() => navigate(`/statement/${statement.statementId}`)}
						aria-label={t('Drill down')}
					>
						<span className="material-symbols-outlined" style={{ fontSize: 18 }}>jump_to_element</span>
					</button>
				</div>
				{showReplyInput && (
					<form className={styles['tree-option-node__reply-form']} onSubmit={handleReplySubmit}>
						<textarea
							ref={replyInputRef}
							className={styles['tree-option-node__reply-input']}
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
							className={styles['tree-option-node__reply-send']}
							aria-label={t('Send')}
						>
							<SendIcon color="var(--btn-primary, #5f88e5)" />
						</button>
					</form>
				)}
				<input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} />
			</div>
		</div>
	);
};

export default TreeOptionNode;
