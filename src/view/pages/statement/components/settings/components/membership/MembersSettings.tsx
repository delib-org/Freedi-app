import { FC, useEffect, useState } from 'react';
import { createSelector } from '@reduxjs/toolkit';
import { collection, getDocs, query, where } from 'firebase/firestore';

// Third party imports
import { useParams } from 'react-router';

// Redux Store
import { FireStore } from '../../../../../../../controllers/db/config';
import SetWaitingList from '../../../../../../../controllers/db/waitingList/SetWaitingList';
import MembershipLine from './membershipCard/MembershipCard';
import ShareIcon from '@/assets/icons/shareIcon.svg?react';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { creatorSelector } from '@/redux/creator/creatorSlice';

// Custom components

// Hooks & Helpers
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { RootState } from '@/redux/store';
import styles from './MembersSettings.module.scss';
import { StatementSubscription, Role, Statement, Collections } from '@freedi/shared-types';

interface MembersSettingsProps {
	statement: Statement;
}

const MembersSettings: FC<MembersSettingsProps> = ({ statement }) => {
	// * Hooks * //
	const { statementId } = useParams();
	const { t } = useTranslation();
	const [userCount, setUserCount] = useState<number>(0);
	const user = useAppSelector(creatorSelector);
	const userId = user?.uid;

	const statementMembershipSelector = (statementId: string | undefined) =>
		createSelector(
			(state: RootState) => state.statements.statementMembership,
			(memberships) =>
				memberships.filter(
					(membership: StatementSubscription) => membership.statementId === statementId,
				),
		);

	function handleShare(statement: Statement | undefined) {
		const baseUrl = window.location.origin;

		const shareData = {
			title: t('FreeDi: Empowering Agreements'),
			text: t('Invited:') + statement?.statement,
			url: `${baseUrl}/statement-an/true/${statement?.statementId}/options`,
		};
		navigator.share(shareData);
	}

	useEffect(() => {
		const fetchAwaitingUsers = async (): Promise<void> => {
			if (!userId) {
				setUserCount(0);

				return;
			}

			try {
				const awaitingUsersQuery = query(
					collection(FireStore, Collections.awaitingUsers),
					where('adminIds', 'array-contains', userId),
				);
				const usersSnapshot = await getDocs(awaitingUsersQuery);
				setUserCount(usersSnapshot.docs.length);
			} catch (error) {
				console.error('Error fetching awaiting users:', error);
				setUserCount(0);
			}
		};

		fetchAwaitingUsers();
	}, [userId]);

	const members: StatementSubscription[] = useAppSelector(statementMembershipSelector(statementId));

	if (!members) return null;

	const joinedMembers = members.filter((member) => member.role !== Role.banned);
	const bannedUser = members.filter((member) => member.role === Role.banned);

	return (
		<div className={styles.membersSettings}>
			<button className={styles.linkAnonymous} onClick={() => handleShare(statement)}>
				{t('Send a link to anonymous users')}
				<ShareIcon />
			</button>
			<div className="upload-waiting-list">
				<SetWaitingList />
			</div>
			<div className="title">
				{t('Joined members')} ({`${userCount}`})
			</div>
			<div className={styles.membersBox}>
				{joinedMembers.map((member) => (
					<MembershipLine key={member.user.uid} member={member} />
				))}
			</div>

			<div className="title">
				{t('Banned users')} ({bannedUser.length})
			</div>
			<div className={styles.membersBox}>
				{bannedUser.map((member) => (
					<MembershipLine key={member.user.uid} member={member} />
				))}
			</div>
		</div>
	);
};

export default MembersSettings;
