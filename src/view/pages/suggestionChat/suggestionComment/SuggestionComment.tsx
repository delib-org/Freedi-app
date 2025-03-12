import { Statement, StatementType } from 'delib-npm';
import styles from './SuggestionComment.module.scss';
import { FC, KeyboardEvent, useEffect } from 'react';
import { useSuggestionComment } from './SuggestionCommentMV';
import CreatorEvaluationIcon from './CreatorEvaluationIcon/CreatorEvaluationIcon';
import { saveStatementToDB } from '@/controllers/db/statements/setStatements';
import { useSelector } from 'react-redux';
import { statementSubsSelector } from '@/redux/statements/statementsSlice';
import { listenToAllSubStatements, listenToSubStatements } from '@/controllers/db/statements/listenToStatements';
import { stat } from 'fs';

interface Props {
	parentStatement: Statement
	statement: Statement
}
const SuggestionComment: FC<Props> = ({ statement, parentStatement }) => {
	const { evaluationNumber } = useSuggestionComment({ parentStatement, statement });
	const creator = statement.creator;
	const comments = useSelector(statementSubsSelector(statement.statementId));

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
				console.log(statement.statementId)
				saveStatementToDB({
					text,
					parentStatement: statement,
					statementType: StatementType.statement
				})
			}
			target.value = '';
		}
	}

	return (
		<div className={styles.suggestionComment}>
			<p>{creator.displayName}</p>
			<div>{statement.statement} <CreatorEvaluationIcon evaluationNumber={evaluationNumber} /></div>
			{comments.map((comment) => (<p key={comment.statementId}>{comment.statement}</p>))}
			<textarea name="commentInput" onKeyUp={handleCommentSubmit}></textarea>

		</div>
	)
}

export default SuggestionComment