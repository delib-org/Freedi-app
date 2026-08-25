import { Navigate, useParams } from 'react-router-dom';
import { OrganizationRole } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useAuth } from '@/auth/AuthContext';
import { useOrg } from '@/org/OrgContext';
import { useOrgInvitations, useOrgMembers } from '@/db/orgStatements';
import {
	inviteOrgMember,
	removeOrgMember,
	resendOrgInvite,
	revokeOrgInvite,
	type GrantableOrgRole,
} from '@/db/orgFunctions';
import { Skeleton } from '@/components/atomic/atoms';
import { InviteMemberForm } from '@/components/atomic/molecules/InviteMemberForm';
import { MemberList } from '@/components/atomic/molecules/MemberList';
import StudioPage from '../_shared/StudioPage';
import { Notice, useNotice } from '../_shared/Notice';
import styles from './People.module.scss';

/** `/orgs/:orgId/people` — roster + invitations. Viewers are sent back to the questions. */
export default function People() {
	const { t } = useTranslation();
	const { orgId } = useParams<{ orgId: string }>();
	const { user } = useAuth();
	const { currentRole, isSystemAdmin, canManage, loading: orgLoading } = useOrg();
	const members = useOrgMembers(orgId);
	const invitations = useOrgInvitations(orgId);
	const { notice, show } = useNotice();

	const isViewer = currentRole === OrganizationRole.viewer && !isSystemAdmin;
	if (!orgLoading && isViewer) return <Navigate to={`/orgs/${orgId}`} replace />;

	const existingEmails = [
		...members.data.map((m) => m.email),
		...invitations.data.map((i) => i.invitedEmail),
	];

	const copyLink = async (link: string) => {
		try {
			await navigator.clipboard.writeText(link);

			return true;
		} catch {
			return false;
		}
	};

	const handleInvite = async (email: string, role: GrantableOrgRole) => {
		if (!orgId) throw new Error('Missing organization');
		const { inviteLink } = await inviteOrgMember({ organizationId: orgId, email, role });

		return { inviteLink };
	};

	const withNotice = async (action: () => Promise<void>, failure: string) => {
		try {
			await action();
		} catch (error) {
			show(failure, 'error');
			throw error;
		}
	};

	const handleRemove = (userId: string) =>
		withNotice(async () => {
			if (!orgId) return;
			await removeOrgMember({ organizationId: orgId, userId });
			show(t('Member removed'));
		}, t('Could not remove the member.'));

	const handleResend = (invitationId: string) =>
		withNotice(async () => {
			const { inviteLink } = await resendOrgInvite({ invitationId });
			const copied = await copyLink(inviteLink);
			show(copied ? t('Invitation resent and link copied') : t('Invitation resent'));
		}, t('Could not resend the invitation.'));

	const handleCopyLink = (invitationId: string) =>
		withNotice(async () => {
			const { inviteLink } = await resendOrgInvite({ invitationId });
			const copied = await copyLink(inviteLink);
			show(copied ? t('Invitation link copied') : inviteLink, copied ? 'success' : 'info');
		}, t('Could not copy the invitation link.'));

	const handleRevoke = (invitationId: string) =>
		withNotice(async () => {
			await revokeOrgInvite({ invitationId });
			show(t('Invitation revoked'));
		}, t('Could not revoke the invitation.'));

	const handleChangeRole = async () => {
		// Role changes are not available in v1 (the select is disabled).
	};

	const loading = members.loading || invitations.loading;

	return (
		<StudioPage breadcrumb={[{ label: t('People') }]} title={t('People')}>
			{canManage && (
				<section className={styles.invite} aria-label={t('Invite a member')}>
					<InviteMemberForm
						onInvite={handleInvite}
						existingEmails={existingEmails}
						canInviteOwner={currentRole === OrganizationRole.owner || isSystemAdmin}
					/>
				</section>
			)}

			{loading ? (
				<div className={styles.skeleton} aria-hidden="true">
					<Skeleton variant="header" />
					<Skeleton variant="text" />
					<Skeleton variant="text" />
				</div>
			) : (
				<MemberList
					members={members.data}
					invitations={invitations.data}
					currentUid={user?.uid ?? ''}
					canManage={canManage}
					onChangeRole={handleChangeRole}
					onRemove={handleRemove}
					onResend={handleResend}
					onRevoke={handleRevoke}
					onCopyLink={handleCopyLink}
				/>
			)}

			<Notice notice={notice} />
		</StudioPage>
	);
}
