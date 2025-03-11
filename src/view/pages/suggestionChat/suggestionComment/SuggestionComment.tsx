import { Statement } from 'delib-npm';
import styles from './SuggestionComment.module.scss';
import { FC } from 'react';
import { useSuggestionComment } from './SuggestionCommentMV';

import { useSelector } from 'react-redux';
import { creatorSelector } from '@/redux/creator/creatorSlice';

interface Props {
	parentStatement: Statement
	statement: Statement
}
const SuggestionComment: FC<Props> = ({ statement, parentStatement }) => {
	const { creatorEvaluation } =
		useSuggestionComment({ parentStatement, statement });
	const creator = statement.creator;
	return (
		<div className={styles.suggestionComment}>
			<p>{creator.displayName}</p>
			<p>{statement.statement} ({creatorEvaluation})</p>
		</div>
	)
}

export default SuggestionComment