import { FC, useMemo } from 'react';
import { createSelector } from '@reduxjs/toolkit';
import { StatementSubscription, Role, Statement } from '@freedi/shared-types';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { RootState } from '@/redux/store';
import InviteLinkToLive from '../../../host/InviteLinkToLive';
import MembershipLine from './membershipCard/MembershipCard';
import styles from './MembersSettings.module.scss';

interface MembersSettingsProps {
	statement: Statement;
}

/**
 * Joined and blocked people of this space. No count beside "Members": the
 * old number was the host's waiting list across every space, not this one.
 * Retired in phase 5 of docs/ux/main-people-settings-ux.md (one Members list).
 */
const MembersSettings: FC<MembersSettingsProps> = ({ statement }) => {
	const { t } = useTranslation();
	const { statementId } = statement;

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

	const validMembers = members.filter((member) => member.user?.uid);
	const joinedMembers = validMembers.filter((member) => member.role !== Role.banned);
	const bannedMembers = validMembers.filter((member) => member.role === Role.banned);

	return (
		<div className={styles.membersSettings}>
			<InviteLinkToLive statementId={statementId} />
			<div className="title">{t('people.members')}</div>
			<div className={styles.membersBox}>
				{joinedMembers.map((member) => (
					<MembershipLine key={member.user?.uid} member={member} />
				))}
			</div>

			<div className="title">
				{t('people.role.banned')} ({bannedMembers.length})
			</div>
			<div className={styles.membersBox}>
				{bannedMembers.map((member) => (
					<MembershipLine key={member.user?.uid} member={member} />
				))}
			</div>
		</div>
	);
};

export default MembersSettings;
