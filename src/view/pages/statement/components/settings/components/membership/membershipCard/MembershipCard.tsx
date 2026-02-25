import { FC, useState, useEffect } from 'react';
import styles from './MembershipCard.module.scss';
import { logError } from '@/utils/errorHandling';

//icons
import unBlockImg from '@/assets/icons/Icon-base-46px.png';
import MemberAdmin from '@/assets/icons/memberAdmin.svg?react';
import MemberRemove from '@/assets/icons/memberRemove.svg?react';
import { updateMemberRole } from '@/controllers/db/subscriptions/setSubscriptions';
import { StatementSubscription, Role } from '@freedi/shared-types';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { canBanUser, getBanDisabledReason } from '@/helpers/roleHelpers';

interface Props {
	member: StatementSubscription;
}

const MembershipCard: FC<Props> = ({ member }) => {
	const firstLetter = member.user.displayName.charAt(0).toUpperCase();
	const displayImg = member.user.photoURL;
	const [role, setRole] = useState(member.role);
	const { user } = useAuthentication();

	useEffect(() => {
		if (member.role) setRole(member.role);
	}, [member.role]);

	if (member.user?.uid === user?.uid) return null;

	// Check if this user can be banned (not admin or creator)
	const userCanBeBanned = canBanUser(role, member.user.uid, member.statement);
	const banDisabledReason = getBanDisabledReason(role, member.user.uid, member.statement);

	async function handleRemoveMember() {
		// If trying to ban, check if user can be banned
		if (role !== Role.banned && !userCanBeBanned) {
			logError(banDisabledReason, {
				operation: 'membershipCard.MembershipCard.handleRemoveMember',
				metadata: { message: 'Cannot ban this user:' },
			});

			return;
		}

		const newRole = role === Role.banned ? Role.member : Role.banned;
		try {
			await updateMemberRole(member.statementId, member.user.uid, newRole);
			setRole(newRole);
		} catch (error) {
			logError(error, {
				operation: 'membershipCard.MembershipCard.handleRemoveMember',
				metadata: { message: 'Error removing member:' },
			});
		}
	}

	async function handleSetRole() {
		try {
			const newRole = role === Role.admin ? Role.member : Role.admin;
			if (!member.user?.uid) throw new Error('No user id');
			await updateMemberRole(member.statementId, member.user?.uid, newRole);
			setRole(newRole);
		} catch (error) {
			logError(error, {
				operation: 'membershipCard.MembershipCard.handleSetRole',
				metadata: { message: 'Error setting role:' },
			});
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
				<div className={`${styles.card__info__name} ${isBanned ? styles.bannedText : ''}`}>
					{member.user.displayName}
				</div>
			</div>
			<div className={styles.card__membership}>
				{isBanned ? (
					<button onClick={handleRemoveMember}>
						<img src={unBlockImg} alt="Unblock" className={styles.unBlockImg} />
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
							disabled={!userCanBeBanned}
							title={banDisabledReason || ''}
							style={{
								opacity: userCanBeBanned ? 1 : 0.5,
								cursor: userCanBeBanned ? 'pointer' : 'not-allowed',
							}}
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
