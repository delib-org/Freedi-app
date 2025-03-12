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

						<button className={styles.reply}>השב/י</button>
					</>
					}
				</>
			)}
		</div>
	)
}

export default SuggestionComment