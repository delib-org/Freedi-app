import { Statement, StatementType } from 'delib-npm';
import styles from './SuggestionComment.module.scss';
import { FC, KeyboardEvent, useEffect, useState } from 'react';
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
import EnhancedEvaluation from '../../statement/components/evaluations/components/evaluation/enhancedEvaluation/EnhancedEvaluation';
import { evaluationSelector } from '@/redux/evaluations/evaluationsSlice';

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

	useEffect(() => {
		const unsubscribe = listenToSubStatements(statement.statementId);

		return () => unsubscribe();
	}, [])

	useEffect(() => {
		if (previousEvaluation) {

			setEvaluationChanged(true)
		}
	}, [previousEvaluation])

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
				const _text = !isCreator && evaluationChanged ? `, ${text} ${t('change to:')} :${previousEvaluation}` : text;
				// Add comment
				saveStatementToDB({
					text: _text,
					parentStatement: statement,
					statementType: StatementType.statement
				})
			}
			target.value = '';
			setEvaluationChanged(false);
			setShowInput(false);
		}
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
				<div>
					<ProfileImage statement={statement} />
					<CreatorEvaluationIcon evaluationNumber={evaluationNumber} />
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
						{showInput && <textarea
							className={styles.commentInput}
							name="commentInput"
							onKeyUp={handleCommentSubmit}
							placeholder={t("Write your comment...")}
							autoFocus
						></textarea>}
						{!showInput && <button className={styles.replyButton} onClick={() => setShowInput(true)}>השב/י</button>}
					</>
					}
				</>
			)}
		</div>
	)
}

export default SuggestionComment