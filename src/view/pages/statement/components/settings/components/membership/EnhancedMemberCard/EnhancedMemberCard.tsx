import { FC, useState, useEffect, useMemo } from 'react';
import styles from './EnhancedMemberCard.module.scss';
import { StatementSubscription, Role } from '@freedi/shared-types';
import { updateMemberRole } from '@/controllers/db/subscriptions/setSubscriptions';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { canBanUser, getBanDisabledReason } from '@/helpers/roleHelpers';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { logError } from '@/utils/errorHandling';

interface EnhancedMemberCardProps {
	member: StatementSubscription;
	searchTerm?: string;
}

const EnhancedMemberCard: FC<EnhancedMemberCardProps> = ({ member, searchTerm }) => {
	const { t } = useTranslation();
	const { user } = useAuthentication();
	const [role, setRole] = useState(member.role);
	const [isUpdating, setIsUpdating] = useState(false);

	const firstLetter = member.user.displayName.charAt(0).toUpperCase();
	const displayImg = member.user.photoURL;

	// Check if this is the current user (used for conditional rendering, not early return)
	const isCurrentUser = member.user?.uid === user?.uid;

	useEffect(() => {
		if (member.role) setRole(member.role);
	}, [member.role]);

	// Check if this user can be banned
	const userCanBeBanned = canBanUser(role, member.user.uid, member.statement);
	const banDisabledReason = getBanDisabledReason(role, member.user.uid, member.statement);

	// Format join date
	const joinDate = useMemo(() => {
		if (!member.createdAt) return '';
		const date = new Date(member.createdAt);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffDays === 0) return t('Today');
		if (diffDays === 1) return t('Yesterday');
		if (diffDays < 7) return `${diffDays} ${t('days ago')}`;
		if (diffDays < 30) return `${Math.floor(diffDays / 7)} ${t('weeks ago')}`;
		if (diffDays < 365) return `${Math.floor(diffDays / 30)} ${t('months ago')}`;

		return `${Math.floor(diffDays / 365)} ${t('years ago')}`;
	}, [member.createdAt, t]);

	// Highlight search term in name
	const highlightedName = useMemo(() => {
		if (!searchTerm) return member.user.displayName;

		const regex = new RegExp(`(${searchTerm})`, 'gi');
		const parts = member.user.displayName.split(regex);

		return parts.map((part, index) =>
			regex.test(part) ? (
				<mark key={index} className={styles.highlight}>
					{part}
				</mark>
			) : (
				part
			),
		);
	}, [member.user.displayName, searchTerm]);

	const handleToggleRole = async () => {
		if (isUpdating) return;

		try {
			setIsUpdating(true);
			const newRole = role === Role.admin ? Role.member : Role.admin;

			if (!member.user?.uid) throw new Error('No user id');

			await updateMemberRole(member.statementId, member.user?.uid, newRole);
			setRole(newRole);
		} catch (error) {
			logError(error, { operation: 'EnhancedMemberCard.EnhancedMemberCard.handleToggleRole', metadata: { message: 'Error updating role:' } });
		} finally {
			setIsUpdating(false);
		}
	};

	const handleToggleBan = async () => {
		if (isUpdating) return;

		// If trying to ban, check if user can be banned
		if (role !== Role.banned && !userCanBeBanned) {
			logError(banDisabledReason, { operation: 'EnhancedMemberCard.EnhancedMemberCard.handleToggleBan', metadata: { message: 'Cannot ban this user:' } });

			return;
		}

		try {
			setIsUpdating(true);
			const newRole = role === Role.banned ? Role.member : Role.banned;

			await updateMemberRole(member.statementId, member.user.uid, newRole);
			setRole(newRole);
		} catch (error) {
			logError(error, { operation: 'EnhancedMemberCard.EnhancedMemberCard.handleToggleBan', metadata: { message: 'Error toggling ban:' } });
		} finally {
			setIsUpdating(false);
		}
	};

	const isBanned = role === Role.banned;
	const isAdmin = role === Role.admin;

	// Hide card if it's the current user (after all hooks)
	if (isCurrentUser) return null;

	return (
		<article
			className={`${styles.memberCard} ${isBanned ? styles['memberCard--banned'] : ''}`}
			role="article"
			aria-label={`${t('Member')}: ${member.user.displayName}, ${t('Role')}: ${role}`}
		>
			<div className={styles.avatar}>
				{displayImg ? (
					<img
						src={displayImg}
						alt={member.user.displayName}
						className={isBanned ? styles['avatar--banned'] : ''}
					/>
				) : (
					<span className={styles.avatarLetter}>{firstLetter}</span>
				)}
			</div>

			<div className={styles.info}>
				<div className={styles.name}>{highlightedName}</div>
				<div className={styles.metadata}>
					<span
						className={`${styles.roleBadge} ${styles[`roleBadge--${role}`]}`}
						aria-label={`${t('Role')}: ${role}`}
					>
						{role === Role.admin ? t('Admin') : role === Role.banned ? t('Banned') : t('Member')}
					</span>
					{joinDate && (
						<span className={styles.joinDate}>
							{t('Joined')} {joinDate}
						</span>
					)}
				</div>
			</div>

			<div className={styles.actions}>
				{isBanned ? (
					<button
						className={styles.unbanButton}
						onClick={handleToggleBan}
						disabled={isUpdating}
						aria-label={t('Unban member')}
						title={t('Unban member')}
					>
						<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
							<path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
						</svg>
					</button>
				) : (
					<>
						<button
							className={`${styles.adminToggle} ${isAdmin ? styles['adminToggle--active'] : ''}`}
							onClick={handleToggleRole}
							disabled={isUpdating}
							aria-label={isAdmin ? t('Remove admin') : t('Make admin')}
							title={isAdmin ? t('Remove admin') : t('Make admin')}
							aria-pressed={isAdmin}
						>
							<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
								<path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
								<path
									fillRule="evenodd"
									d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
									clipRule="evenodd"
								/>
							</svg>
						</button>
						<button
							className={styles.banToggle}
							onClick={handleToggleBan}
							disabled={!userCanBeBanned || isUpdating}
							aria-label={t('Ban member')}
							title={banDisabledReason || t('Ban member')}
						>
							<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
								<path
									fillRule="evenodd"
									d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z"
									clipRule="evenodd"
								/>
							</svg>
						</button>
					</>
				)}
			</div>
		</article>
	);
};

export default EnhancedMemberCard;
