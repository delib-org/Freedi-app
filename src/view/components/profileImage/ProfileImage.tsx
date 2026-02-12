import { FC } from "react";
import { Creator, Statement } from "@freedi/shared-types";
import styles from './ProfileImage.module.scss';
import DefaultAvatar from '@/assets/images/avatar.jpg';

interface Props {
	statement: Statement;
	creator?: Creator;
	isSmall?: boolean;
}

const ProfileImage: FC<Props> = ({ statement, isSmall, creator }) => {
	const talker = creator || statement.creator;
	const avatar = talker.photoURL ? talker.photoURL : DefaultAvatar;

	if (!talker) return null;

	return (
		<div
			className={`${styles.profileImage} ${isSmall ? styles.small : ''}`}
			style={{ backgroundImage: `url(${avatar})` }}
			title={talker?.displayName}
		>
		</div>
	);
};

export default ProfileImage;