import { Statement } from 'delib-npm'
import { FC } from 'react';
import styles from './SubComment.module.scss';
import ProfileImage from '@/view/components/profileImage/ProfileImage';

interface Props {
	statement: Statement;
}

const SubComment: FC<Props> = ({ statement }) => {
	return (
		<div className={styles.subComment}><ProfileImage statement={statement} />: <span className={styles.text}>{statement.statement}</span></div>
	)
}

export default SubComment