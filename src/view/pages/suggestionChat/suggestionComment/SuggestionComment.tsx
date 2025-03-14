import { Statement, StatementType } from 'delib-npm';
import styles from './SuggestionComment.module.scss';
import { FC, KeyboardEvent, useEffect, useState, useRef, ChangeEvent } from 'react';
import { useSuggestionComment } from './SuggestionCommentMV';
import CreatorEvaluationIcon from './CreatorEvaluationIcon/CreatorEvaluationIcon';
import { saveStatementToDB } from '@/controllers/db/statements/setStatements';
import { useSelector } from 'react-redux';
import { setStatementSubscription, statementSubscriptionSelector, statementSubsSelector } from '@/redux/statements/statementsSlice';
import { listenToSubStatements } from '@/controllers/db/statements/listenToStatements';
import SubComment from './subComment/SubComment';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import ProfileImage from '@/view/components/profileImage/ProfileImage';
import { evaluationSelector } from '@/redux/evaluations/evaluationsSlice';
import EvaluationPopup from './evaluationPopup/EvaluationPopup';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import StatementChatMore from '../../statement/components/chat/components/StatementChatMore';
import { setStatementSubscriptionToDB } from '@/controllers/db/subscriptions/setSubscriptions';
import { clearInAppNotifications } from '@/controllers/db/inAppNotifications/db_inAppNotifications';

interface Props {
	parentStatement: Statement
	statement: Statement
}

const SuggestionComment: FC<Props> = ({ statement, parentStatement }) => {
	const { t } = useUserConfig();
	const subscription = useSelector(statementSubscriptionSelector(statement.statementId));
	const initialStatement = useRef(parentStatement.statement);
	const initialDescription = useRef(parentStatement.description);
	const { user } = useAuthentication();
	const { evaluationNumber } = useSuggestionComment({ parentStatement, statement });
	const comments = useSelector(statementSubsSelector(statement.statementId));
	const previousEvaluation = useSelector(evaluationSelector(parentStatement.statementId, user?.uid));
	const [isOpen, setIsOpen] = useState(false);
	const [showInput, setShowInput] = useState(false);
	const [evaluationChanged, setEvaluationChanged] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

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
		if (user?.uid !== parentStatement.creator.uid) return;

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

	const isCreator = parentStatement.creator.uid === user?.uid;

	console.log("parentStatement", statement.statement)

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
					console.log("Subscribe to:", statement.statement)
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
			<button
				className={styles.commentHeader}
				onClick={toggleAccordion}
				onKeyDown={(e) => { if (e.key === 'Enter') toggleAccordion(); }}
				tabIndex={0}
			>
				<div className={styles.creatorText}>
					<div className={styles.commentCreator}>
						<ProfileImage statement={statement} />
						<CreatorEvaluationIcon evaluationNumber={evaluationNumber} />
					</div>
					<div className={styles.commentText} style={{ userSelect: 'text' }} >
						{statement.statement}, {statement.statementId}
					</div>
					<div className={styles.notifications}>
						<StatementChatMore statement={statement} onlyCircle={true} useLink={false} />
					</div>
				</div>

				<span className={`${styles.accordionIcon} ${isOpen ? styles.open : ''}`}>
					▼
				</span>
			</button>
			{isOpen && (
				<>
					<div className={styles.subComments}>
						<SubComment statement={statement} />
						{comments.map((comment) => (
							<SubComment key={comment.statementId} statement={comment} />
						))}
					</div>

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
					{!showInput && <button className={styles.replyButton} onClick={() => setShowInput(true)}>השב/י</button>}

				</>
			)}
		</div>
	);
};

export default SuggestionComment;