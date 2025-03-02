import { FC, useState, useEffect } from 'react';
import styles from './MembershipCard.module.scss';

//icons
import unBlockImg from '@/assets/icons/Icon-base-46px.png';
import MemberAdmin from '@/assets/icons/memberAdmin.svg?react';
import MemberRemove from '@/assets/icons/memberRemove.svg?react';
import { updateMemberRole } from '@/controllers/db/subscriptions/setSubscriptions';
import { StatementSubscription } from '@/types/statement/StatementSubscription';
import { Role } from '@/types/user/UserSettings';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';

interface Props {
	member: StatementSubscription;
}

const MembershipCard: FC<Props> = ({ member }) => {
	const firstLetter = member.creator.displayName.charAt(0).toUpperCase();
	const displayImg = member.creator.photoURL;
	const [role, setRole] = useState(member.role);
	const { user } = useAuthentication();

	useEffect(() => {
		setRole(member.role);
	}, [member.role]);

	if (member.creator.uid === user.uid) return null;

	async function handleRemoveMember() {
		const newRole = role === Role.banned ? Role.member : Role.banned;
		try {
			await updateMemberRole(
				member.statementId,
				member.creator.uid,
				newRole
			);
			setRole(newRole);
		} catch (error) {
			console.error('Error removing member:', error);
		}
	}

	async function handleSetRole() {
		try {
			const newRole = role === Role.admin ? Role.member : Role.admin;
			await updateMemberRole(
				member.statementId,
				member.creator.uid,
				newRole
			);
			setRole(newRole);
		} catch (error) {
			console.error('Error setting role:', error);
		}
	}

	const isBanned = role === Role.banned;
	const isAdmin = role === Role.admin;

	return (
		<div className={`${styles.card} ${isBanned ? styles.banned : ''}`}>
			<div className={styles.card__info}>
				<div
					className={`${styles.card__info__img} ${isBanned ? styles.bannedImg : ''}`}
					style={{ backgroundImage: `url(${displayImg})` }}
				>
					{!displayImg && firstLetter}
				</div>
				<div
					className={`${styles.card__info__name} ${isBanned ? styles.bannedText : ''}`}
				>
					{member.creator.displayName}
				</div>
			</div>
			<div className={styles.card__membership}>
				{isBanned ? (
					<button onClick={handleRemoveMember}>
						<img
							src={unBlockImg}
							alt='Unblock'
							className={styles.unBlockImg}
						/>
					</button>
				) : (
					<>
						<button
							onClick={handleSetRole}
							className={`${styles['card__membership--admin']} ${isAdmin ? styles.admin : ''}`}
						>
							<MemberAdmin />
						</button>
						<button
							onClick={handleRemoveMember}
							className={styles['card__membership--remove']}
						>
							<MemberRemove />
						</button>
					</>
				)}
			</div>
		</div>
	);
};

export default MembershipCard;
