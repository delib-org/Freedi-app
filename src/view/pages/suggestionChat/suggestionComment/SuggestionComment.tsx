import { Statement } from 'delib-npm';
import styles from './SuggestionComment.module.scss';
import { FC } from 'react';
import { useSuggestionComment } from './SuggestionCommentMV';
import CreatorEvaluationIcon from './CreatorEvalautionIcon';


interface Props {
	parentStatement: Statement
	statement: Statement
}
const SuggestionComment: FC<Props> = ({ statement, parentStatement }) => {
	const { evaluationNumber } = useSuggestionComment({ parentStatement, statement });
	const creator = statement.creator;

	return (
		<div className={styles.suggestionComment}>
			<p>{creator.displayName}</p>
			<p>{statement.statement} <CreatorEvaluationIcon evaluationNumber={evaluationNumber} statement={statement} /></p>
		</div>
	)
}

export default SuggestionComment