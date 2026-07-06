import { FC, useMemo, useState } from 'react';
import { createSelector } from '@reduxjs/toolkit';
import { Role, Statement, StatementSubscription } from '@freedi/shared-types';
import styles from './AdminsManagement.module.scss';
import { updateMemberRole } from '@/controllers/db/subscriptions/setSubscriptions';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { statementSubscriptionSelector } from '@/redux/statements/statementsSlice';
import { RootState } from '@/redux/store';
import { logError } from '@/utils/errorHandling';

interface AdminsManagementProps {
	statement: Statement;
}

const AdminsManagement: FC<AdminsManagementProps> = ({ statement }) => {
	const { t } = useTranslation();
	const { statementId } = statement;

	const [searchTerm, setSearchTerm] = useState('');
	const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const currentUser = useAppSelector(creatorSelector);
	const currentUserSubscription = useAppSelector(statementSubscriptionSelector(statementId));

	const membershipSelector = useMemo(
		() =>
			createSelector(
				(state: RootState) => state.statements.statementMembership,
				(memberships) =>
					memberships.filter(
						(membership: StatementSubscription) => membership.statementId === statementId,
					),
			),
		[statementId],
	);
	const members: StatementSubscription[] = useAppSelector(membershipSelector);

	const isStatementCreator = statement.creator?.uid === currentUser?.uid;
	const canManageAdmins =
		isStatementCreator ||
		currentUserSubscription?.role === Role.admin ||
		currentUserSubscription?.role === Role.creator;

	const admins = useMemo(
		() =>
			members.filter(
				(member) =>
					member.user?.uid && (member.role === Role.admin || member.role === Role.creator),
			),
		[members],
	);

	const regularMembers = useMemo(
		() => members.filter((member) => member.user?.uid && member.role === Role.member),
		[members],
	);

	const promotableMembers = useMemo(() => {
		if (!searchTerm) return regularMembers;
		const searchLower = searchTerm.toLowerCase();

		return regularMembers.filter((member) =>
			(member.user?.displayName ?? '').toLowerCase().includes(searchLower),
		);
	}, [regularMembers, searchTerm]);

	// Only the creator or an admin may manage admins (Firestore rules enforce this too)
	if (!canManageAdmins) return null;

	async function handleRoleChange(userId: string | undefined, newRole: Role): Promise<void> {
		if (!canManageAdmins || !userId || updatingUserId) return;
		// Never change the statement creator's role
		if (userId === statement.creator?.uid) return;

		try {
			setErrorMessage(null);
			setUpdatingUserId(userId);
			await updateMemberRole(statementId, userId, newRole);
		} catch (error) {
			logError(error, {
				operation: 'AdminsManagement.handleRoleChange',
				userId,
				statementId,
				metadata: { newRole },
			});
			setErrorMessage(t('Failed to update role'));
		} finally {
			setUpdatingUserId(null);
		}
	}

	return (
		<div className={styles.adminsManagement}>
			<h3 className={styles.adminsManagement__subtitle}>
				{t('Current admins')} ({admins.length})
			</h3>
			<ul className={styles.adminsManagement__list}>
				{admins.map((admin) => {
					const isCreatorRow = admin.user?.uid === statement.creator?.uid;
					const isSelf = admin.user?.uid === currentUser?.uid;

					return (
						<li key={admin.user!.uid} className={styles.adminsManagement__row}>
							<span className={styles.adminsManagement__name}>
								{admin.user?.displayName}
								{isCreatorRow && (
									<span className={styles.adminsManagement__badge}>{t('Creator')}</span>
								)}
								{isSelf && <span className={styles.adminsManagement__badge}>{t('You')}</span>}
							</span>
							{!isCreatorRow && !isSelf && (
								<button
									type="button"
									className={styles['adminsManagement__button--demote']}
									onClick={() => handleRoleChange(admin.user?.uid, Role.member)}
									disabled={updatingUserId !== null}
									aria-label={`${t('Remove admin')}: ${admin.user?.displayName}`}
								>
									{t('Remove admin')}
								</button>
							)}
						</li>
					);
				})}
			</ul>

			<h3 className={styles.adminsManagement__subtitle}>{t('Promote a member to admin')}</h3>
			{regularMembers.length === 0 ? (
				<p className={styles.adminsManagement__hint}>
					{t('No members to promote yet')}.{' '}
					{t('Share the invitation link so people can join, then promote them to admin here')}
				</p>
			) : (
				<>
					<input
						type="search"
						className={styles.adminsManagement__search}
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
						placeholder={t('Search members by name')}
						aria-label={t('Search members by name')}
					/>
					{promotableMembers.length === 0 ? (
						<p className={styles.adminsManagement__hint}>{t('No members match your search')}</p>
					) : (
						<ul className={styles.adminsManagement__list}>
							{promotableMembers.map((member) => (
								<li key={member.user!.uid} className={styles.adminsManagement__row}>
									<span className={styles.adminsManagement__name}>{member.user?.displayName}</span>
									<button
										type="button"
										className={styles['adminsManagement__button--promote']}
										onClick={() => handleRoleChange(member.user?.uid, Role.admin)}
										disabled={updatingUserId !== null}
										aria-label={`${t('Make admin')}: ${member.user?.displayName}`}
									>
										{t('Make admin')}
									</button>
								</li>
							))}
						</ul>
					)}
				</>
			)}

			{errorMessage && (
				<p className={styles.adminsManagement__error} role="alert">
					{errorMessage}
				</p>
			)}
		</div>
	);
};

export default AdminsManagement;
