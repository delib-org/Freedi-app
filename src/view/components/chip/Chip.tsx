import styles from './Chip.module.scss';
import SmileIcon from '@/assets/icons/smileIcon.svg?react';
import { User } from '@/types/user/User';

interface Props {
	user: User | undefined;
}

export default function Chip({ user }: Props) {
	if (!user) return null;
	const displayName = user.displayName.slice(0, 15);

	return (
		<div className={styles.chip}>
			{user.photoURL ? (
				<img src={user.photoURL} alt={user.displayName} />
			) : (
				<SmileIcon style={{ opacity: 0.4 }} />
			)}
			<span>{displayName}</span>
		</div>
	);
}
