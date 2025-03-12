import { Statement } from 'delib-npm'
import { FC } from 'react';
import styles from './SubComment.module.scss';
import ProfileImage from '@/view/components/profileImage/ProfileImage';
import { useSelector } from 'react-redux';
import { creatorSelector } from '@/redux/creator/creatorSlice';

interface Props {
	statement: Statement;
}

const SubComment: FC<Props> = ({ statement }) => {
	const user = useSelector(creatorSelector);
	const isMe = statement.creator.uid === user?.uid;

	return (
		<div className={`${styles.subComment} ${isMe && styles["subComment--isMe"]}`}><ProfileImage statement={statement} />: <span className={styles.text}>{statement.statement}</span></div>
	)
}

export default SubComment