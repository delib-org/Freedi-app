import { Statement } from 'delib-npm'
import { FC } from 'react';
import styles from './SubComment.module.scss';
import ProfileImage from '@/view/components/profileImage/ProfileImage';
import { useSelector } from 'react-redux';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { emojiTransformer } from '@/controllers/general/helpers';
import Text from '@/view/components/text/Text';

interface Props {
	statement: Statement;
}

const SubComment: FC<Props> = ({ statement }) => {
	const user = useSelector(creatorSelector);
	const isMe = statement.creator.uid === user?.uid;

	return (
		<div
			className={`${styles.subComment} ${isMe && styles["subComment--isMe"]}`}>
			<ProfileImage statement={statement} />:	<div className={styles.text}>
				<Text statement={emojiTransformer(statement.statement)} />
			</div>
		</div>
	)
}

export default SubComment