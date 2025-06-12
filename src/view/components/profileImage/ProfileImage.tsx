import { FC } from "react";
import { Statement } from "delib-npm";
import styles from './ProfileImage.module.scss';
import DefaultAvatar from '@/assets/images/avatar.jpg';

interface Props {
	statement: Statement;
}

const ProfileImage: FC<Props> = ({ statement }) => {
	const talker = statement.creator;
	const avatar = talker.photoURL ? talker.photoURL : DefaultAvatar;

	if (!talker) return null;

	return (
		<div
			className={styles.profileImage}
			style={{ backgroundImage: `url(${avatar})` }}
		>
		</div>
	);
};

export default ProfileImage;