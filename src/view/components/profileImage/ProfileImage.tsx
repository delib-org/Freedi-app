import { FC } from 'react';
import { Creator, Statement, StatementType } from '@freedi/shared-types';
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

	// Options are shown without an author name, so suppress the name tooltip.
	const title = statement.statementType === StatementType.option ? undefined : talker?.displayName;

	return (
		<div
			className={`${styles.profileImage} ${isSmall ? styles.small : ''}`}
			style={{ backgroundImage: `url(${avatar})` }}
			title={title}
		></div>
	);
};

export default ProfileImage;
