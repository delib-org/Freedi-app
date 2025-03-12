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

interface Props {
	parentStatement: Statement
	statement: Statement
}

const SuggestionComment: FC<Props> = ({ statement, parentStatement }) => {
	const { t } = useUserConfig();
	const { evaluationNumber } = useSuggestionComment({ parentStatement, statement });
	const comments = useSelector(statementSubsSelector(statement.statementId));
	const [isOpen, setIsOpen] = useState(false);

	useEffect(() => {
		const unsubscribe = listenToSubStatements(statement.statementId);

		return () => unsubscribe();
	}, [])

	function handleCommentSubmit(ev: KeyboardEvent<HTMLTextAreaElement>): void {
		if (ev.key === 'Enter' && !ev.shiftKey) {
			ev.preventDefault();
			const target = ev.target as HTMLTextAreaElement;
			const text = target.value.trim();
			if (text) {
				// Add comment
				saveStatementToDB({
					text,
					parentStatement: statement,
					statementType: StatementType.statement
				})
			}
			target.value = '';
		}
	}

	const toggleAccordion = () => {
		setIsOpen(!isOpen);
	};

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
					<textarea
						name="commentInput"
						onKeyUp={handleCommentSubmit}
						placeholder={t("Write your comment...")}
					></textarea>
				</>
			)}

		</div>
	)
}

export default SuggestionComment