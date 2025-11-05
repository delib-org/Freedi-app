import { Statement, StatementType } from 'delib-npm';
import styles from './SuggestionComment.module.scss';
import { FC, KeyboardEvent, useEffect, useState, useRef, ChangeEvent } from 'react';
import { saveStatementToDB } from '@/controllers/db/statements/setStatements';
import { useDispatch, useSelector } from 'react-redux';
import { statementSubscriptionSelector, statementSubsSelector } from '@/redux/statements/statementsSlice';
import { listenToSubStatements } from '@/controllers/db/statements/listenToStatements';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { evaluationSelector } from '@/redux/evaluations/evaluationsSlice';
import EvaluationPopup from './evaluationPopup/EvaluationPopup';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import StatementChatMore from '../../statement/components/chat/components/statementChatMore/StatementChatMore';
import { setStatementSubscriptionToDB } from '@/controllers/db/subscriptions/setSubscriptions';
import { clearInAppNotifications } from '@/controllers/db/inAppNotifications/db_inAppNotifications';
import { deleteInAppNotificationsByParentId } from '@/redux/notificationsSlice/notificationsSlice';
import Arrow from '@/assets/icons/arrow-down.svg?react';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import CommentCard, { ClassNameType } from './CommentCard/CommentCard';

interface Props {
	parentStatement: Statement
	statement: Statement
}

const SuggestionComment: FC<Props> = ({ statement, parentStatement }) => {
	const { t } = useTranslation();
	const dispatch = useDispatch();
	const subscription = useSelector(statementSubscriptionSelector(statement.statementId));
	const initialStatement = useRef(parentStatement.statement);
	const initialDescription = useRef(parentStatement.description);
	const { user } = useAuthentication();
	const comments = useSelector(statementSubsSelector(statement.statementId));
	const previousEvaluation = useSelector(evaluationSelector(parentStatement.statementId, user?.uid));
	const [isOpen, setIsOpen] = useState(false);
	const [showInput, setShowInput] = useState(false);
	const [evaluationChanged, setEvaluationChanged] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const commentsRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const unsubscribe = listenToSubStatements(statement.statementId);

		return () => {
			unsubscribe();
			clearInAppNotifications(statement.statementId);
		}
	}, []);

	useEffect(() => {
		if (previousEvaluation) {
			setEvaluationChanged(true);
		}
	}, [previousEvaluation]);

	useEffect(() => {
		// Resize the textarea when it becomes visible
		if (showInput && textareaRef.current) {
			adjustTextareaHeight(textareaRef.current);
		}
	}, [showInput]);

	useEffect(() => {
		// observe the comments to mark as read
		if (commentsRef.current) {
			setTimeout(() => {

				dispatch(deleteInAppNotificationsByParentId(statement.statementId));
			}, 2000);
		}
	}, [isOpen])

	useEffect(() => {
		if (user?.uid !== parentStatement?.creator?.uid) return;

		if (initialStatement.current !== parentStatement.statement) {
			saveStatementToDB({
				text: `${t("Title changed by the creator to")}: ${parentStatement.statement}`,
				parentStatement: statement,
				statementType: StatementType.statement
			});
			initialStatement.current = parentStatement.statement;
		}
		if (initialDescription.current !== parentStatement.description) {
			saveStatementToDB({
				text: `${t("Description changed by the creator to")}: ${parentStatement.statement}`,
				parentStatement: statement,
				statementType: StatementType.statement
			});
			initialDescription.current = parentStatement.description;
		}

	}, [parentStatement.statement, parentStatement.description]);

	const toggleAccordion = () => {
		setIsOpen(!isOpen);
	};

	const isCreator = parentStatement?.creator?.uid === user?.uid;

	function handleCommentSubmit(ev: KeyboardEvent<HTMLTextAreaElement>): void {
		if (ev.key === 'Enter' && !ev.shiftKey) {
			ev.preventDefault();
			const target = ev.target as HTMLTextAreaElement;
			const text = target.value.trim();
			if (text) {
				const _text = !isCreator && evaluationChanged ? ` ${text}. ${t('evalaution change to')}... :${previousEvaluation}` : text;
				// Add comment
				saveStatementToDB({
					text: _text,
					parentStatement: statement,
					statementType: StatementType.statement
				});

				if (!isCreator && !subscription) {
					//subscribe to the parent statement
					setStatementSubscriptionToDB({
						statement,
						creator: user,
						getInAppNotification: true
					});
				}
			}
			target.value = '';
			setEvaluationChanged(false);
			setShowInput(false);
		}
	}

	function adjustTextareaHeight(textarea: HTMLTextAreaElement): void {
		// Reset height to calculate scrollHeight correctly
		textarea.style.height = 'auto';
		// Set height based on scrollHeight
		textarea.style.height = `${textarea.scrollHeight}px`;
	}

	function handleTextareaChange(ev: ChangeEvent<HTMLTextAreaElement>): void {
		adjustTextareaHeight(ev.target);
	}

	return (
		<div className={styles.suggestionComment}>
			<div
				className={styles.commentHeader}
				onClick={toggleAccordion}
				onKeyDown={(e) => { if (e.key === 'Enter') toggleAccordion(); }}
				tabIndex={0}
				role="button"
				aria-expanded={isOpen}
			>
				<div className={styles.commentCard}>
					<CommentCard statement={statement} parentStatement={parentStatement} />

					<div className={styles.notifications}>
						<StatementChatMore statement={statement} onlyCircle={true} useLink={false} />
					</div>
				</div>

				<span className={`${styles.accordionIcon} ${isOpen ? styles.open : ''}`}>
					<Arrow />
				</span>
			</div>
			{isOpen && (

				<div ref={commentsRef} className={styles.subComments}>
					{comments.map((comment) => (
						<CommentCard key={comment.statementId} statement={comment} parentStatement={parentStatement} className={ClassNameType.SubCommentCard} />
					))}

					{!showInput && <Button buttonType={ButtonType.SECONDARY} text={t("Add comment")} className={styles.replyButton} onClick={() => setShowInput(true)} />}
					{showInput && <div className={styles.commentInput}>
						<textarea
							ref={textareaRef}
							name="commentInput"
							onKeyUp={handleCommentSubmit}
							onChange={handleTextareaChange}
							placeholder={t("Write your comment...")}
							rows={1}
							autoFocus
						/>
						{!isCreator && <EvaluationPopup parentStatement={parentStatement} />}
					</div>}
				</div>

			)}
		</div>
	);
};

export default SuggestionComment;