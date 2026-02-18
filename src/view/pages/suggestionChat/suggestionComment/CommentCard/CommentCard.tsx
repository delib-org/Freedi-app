import ProfileImage from '@/view/components/profileImage/ProfileImage';
import CreatorEvaluationIcon from '../CreatorEvaluationIcon/CreatorEvaluationIcon';
import styles from './CommentCard.module.scss';
import { Statement } from '@freedi/shared-types';
import { FC } from 'react';
import { useSuggestionComment } from '../SuggestionCommentMV';

export const enum ClassNameType {
	CommentCard = 'commentCard',
	SubCommentCard = 'subCommentCard',
}

interface Props {
	statement: Statement;
	className?: ClassNameType;
	parentStatement?: Statement;
}

const CommentCard: FC<Props> = ({
	statement,
	className = ClassNameType.CommentCard,
	parentStatement,
}) => {
	const { evaluationNumber } = useSuggestionComment({ parentStatement, statement });

	return (
		<div className={styles.commentCreator}>
			<ProfileImage statement={statement} />
			<div className={styles[className]}>
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

export default CommentCard;
