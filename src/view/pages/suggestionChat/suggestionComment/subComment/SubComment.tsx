import { Statement } from '@freedi/shared-types';
import { FC } from 'react';
import styles from './SubComment.module.scss';
import ProfileImage from '@/view/components/profileImage/ProfileImage';
import CreatorEvaluationIcon from '../CreatorEvaluationIcon/CreatorEvaluationIcon';
import { useSuggestionComment } from '../SuggestionCommentMV';

interface Props {
	statement: Statement;
	parentStatement: Statement;
}

const SubComment: FC<Props> = ({ statement, parentStatement }) => {
	const { evaluationNumber } = useSuggestionComment({ parentStatement, statement });

	return (
		<div className={styles.subComment}>
			{/* // <ProfileImage statement={statement} />:	<div className={styles.text}>
			// 	<Text statement={emojiTransformer(statement.statement)} />
			// </div> */}
			<ProfileImage statement={statement} />
			<div className={styles.commentCard}>
				<div className={styles.creatorInfo}>
					<span className={styles.creatorName}>{statement.creator.displayName}</span>
					<CreatorEvaluationIcon evaluationNumber={evaluationNumber} />
				</div>
				<div className={styles.commentText} style={{ userSelect: 'text' }}>
					{statement.statement}
				</div>
			</div>
		</div>
	);
};

export default SubComment;
