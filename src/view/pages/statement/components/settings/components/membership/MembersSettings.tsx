import { FC, useEffect, useState } from 'react';
import { createSelector } from '@reduxjs/toolkit';
import { collection, getDocs } from 'firebase/firestore';

// Third party imports
import { useParams } from 'react-router';

// Redux Store
import { FireStore } from '../../../../../../../controllers/db/config';
import SetWaitingList from '../../../../../../../controllers/db/waitingList/SetWaitingList';
import MembershipLine from './membershipCard/MembershipCard';
import ShareIcon from '@/assets/icons/shareIcon.svg?react';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';

// Custom components

// Hooks & Helpers
import { useLanguage } from '@/controllers/hooks/useLanguages';
import { RootState } from '@/redux/store';
import './MembersSettings.scss';
import { Collections } from '@/types/TypeEnums';
import { Statement } from '@/types/statement/Statement';
import { StatementSubscription } from '@/types/statement/StatementSubscription';
import { Role } from '@/types/user/UserSettings';

interface MembersSettingsProps {
	statement: Statement;
}

const MembersSettings: FC<MembersSettingsProps> = ({ statement }) => {
	// * Hooks * //
	const { statementId } = useParams();
	const { t } = useLanguage();
	const [userCount, setUserCount] = useState<number>(0);

	const statementMembershipSelector = (statementId: string | undefined) =>
		createSelector(
			(state: RootState) => state.statements.statementMembership,
			(memberships) =>
				memberships.filter(
					(membership: StatementSubscription) =>
						membership.statementId === statementId
				)
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

	const fetchAwaitingUsers = async (): Promise<void> => {
		const usersCollection = collection(
			FireStore,
			Collections.awaitingUsers
		);
		const usersSnapshot = await getDocs(usersCollection);
		const count = usersSnapshot.docs.length;

		return setUserCount(count);
	};

	useEffect(() => {
		fetchAwaitingUsers();
	}, []);

	const members: StatementSubscription[] = useAppSelector(
		statementMembershipSelector(statementId)
	);

	if (!members) return null;

	const joinedMembers = members.filter(
		(member) => member.role !== Role.banned
	);
	const bannedUser = members.filter((member) => member.role === Role.banned);

	return (
		<div className='members-settings'>
			<button
				className='link-anonymous'
				onClick={() => handleShare(statement)}
			>
				{t('Send a link to anonymous users')}
				<ShareIcon />
			</button>
			<div className='upload-waiting-list'>
				<SetWaitingList />
			</div>
			<div className='title'>
				{t('Joined members')} ({`${userCount}`})
			</div>
			<div className='members-box'>
				{joinedMembers.map((member) => (
					<MembershipLine key={member.userId} member={member} />
				))}
			</div>

			<div className='title'>
				{t('Banned users')} ({bannedUser.length})
			</div>
			<div className='members-box'>
				{bannedUser.map((member) => (
					<MembershipLine key={member.userId} member={member} />
				))}
			</div>
		</div>
	);
};

export default MembersSettings;
