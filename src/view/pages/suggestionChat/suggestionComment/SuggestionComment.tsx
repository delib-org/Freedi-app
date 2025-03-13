import { Statement, StatementType } from 'delib-npm';
import styles from './SuggestionComment.module.scss';
import { FC, KeyboardEvent, useEffect, useState, useRef, ChangeEvent } from 'react';
import { useSuggestionComment } from './SuggestionCommentMV';
import CreatorEvaluationIcon from './CreatorEvaluationIcon/CreatorEvaluationIcon';
import { saveStatementToDB } from '@/controllers/db/statements/setStatements';
import { useSelector } from 'react-redux';
import { statementSubsSelector } from '@/redux/statements/statementsSlice';
import { listenToSubStatements } from '@/controllers/db/statements/listenToStatements';
import SubComment from './subComment/SubComment';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import ProfileImage from '@/view/components/profileImage/ProfileImage';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { evaluationSelector } from '@/redux/evaluations/evaluationsSlice';
import EvaluationPopup from './evaluationPopup/EvaluationPopup';

interface Props {
	parentStatement: Statement
	statement: Statement
}

const SuggestionComment: FC<Props> = ({ statement, parentStatement }) => {
	const { t } = useUserConfig();
	const user = useSelector(creatorSelector);
	const { evaluationNumber } = useSuggestionComment({ parentStatement, statement });
	const comments = useSelector(statementSubsSelector(statement.statementId));
	const previousEvaluation = useSelector(evaluationSelector(parentStatement.statementId, user?.uid));
	const [isOpen, setIsOpen] = useState(false);
	const [showInput, setShowInput] = useState(false);
	const [evaluationChanged, setEvaluationChanged] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		const unsubscribe = listenToSubStatements(statement.statementId);

		return () => unsubscribe();
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

	const toggleAccordion = () => {
		setIsOpen(!isOpen);
	};

	const hasTalkedLast = comments.length > 0 && comments[comments.length - 1].creator.uid === user?.uid;
	const isCreator = parentStatement.creator.uid === user?.uid;

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
			>
				<div className={styles.commentCreator}>
					<ProfileImage statement={statement} />
					<CreatorEvaluationIcon evaluationNumber={evaluationNumber} />
				</div>
				<div className={styles.commentText}>
					{statement.statement}, {previousEvaluation}
				</div>
				<span className={`${styles.accordionIcon} ${isOpen ? styles.open : ''}`}>
					▼
				</span>
			</div>
			{isOpen && (
				<>
					<div className={styles.subComments}>
						<SubComment statement={statement} />
						{comments.map((comment) => (
							<SubComment key={comment.statementId} statement={comment} />
						))}
					</div>
					{!hasTalkedLast && <>
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
					}
				</>
			)}
		</div>
	);
};

export default SuggestionComment;