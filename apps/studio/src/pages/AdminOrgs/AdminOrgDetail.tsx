import { Link, Navigate, useParams } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useAuth } from '@/auth/AuthContext';
import { useOrg } from '@/org/OrgContext';
import { useOrgInvitations, useOrgMembers } from '@/db/orgStatements';
import { resendOrgInvite } from '@/db/orgFunctions';
import { Button, EmptyState, RoleBadge, Skeleton } from '@/components/atomic/atoms';
import { MemberList } from '@/components/atomic/molecules/MemberList';
import { logError } from '@/utils/logError';
import StudioPage from '../_shared/StudioPage';
import { useGrace } from '../_shared/useGrace';
import { useOrganization } from '../_shared/useOrganization';
import { Notice, useNotice } from '../_shared/Notice';
import styles from './AdminOrgs.module.scss';

/** `/admin/orgs/:orgId` — one organization: roster (read-only) + pending invites. */
export default function AdminOrgDetail() {
	const { t, tWithParams, currentLanguage } = useTranslation();
	const { orgId } = useParams<{ orgId: string }>();
	const { user } = useAuth();
	const { isSystemAdmin, loading: orgLoading } = useOrg();
	const org = useOrganization(orgId);
	const members = useOrgMembers(orgId);
	const invitations = useOrgInvitations(orgId);
	const { notice, show } = useNotice();
	const denied = useGrace(!orgLoading && !isSystemAdmin);

	if (denied) return <Navigate to="/" replace />;

	const dateFormat = new Intl.DateTimeFormat(currentLanguage, { dateStyle: 'medium' });
	const crumbs = [
		{ label: t('Organizations'), to: '/admin/orgs' },
		{ label: org.data?.name ?? t('Organization') },
	];

	const noop = async () => {};

	const resend = async (invitationId: string, copyOnly: boolean) => {
		try {
			const { inviteLink } = await resendOrgInvite({ invitationId });
			let copied = false;
			try {
				await navigator.clipboard.writeText(inviteLink);
				copied = true;
			} catch {
				copied = false;
			}
			if (copyOnly)
				show(copied ? t('Invitation link copied') : inviteLink, copied ? 'success' : 'info');
			else show(copied ? t('Invitation resent and link copied') : t('Invitation resent'));
		} catch (error) {
			logError(error, { operation: 'AdminOrgDetail.resend', metadata: { invitationId } });
			show(t('Could not resend the invitation.'), 'error');
		}
	};

	if (!isSystemAdmin || org.loading) {
		return (
			<StudioPage breadcrumb={crumbs}>
				<div className="studio-loading">{t('Loading…')}</div>
			</StudioPage>
		);
	}

	if (!org.data) {
		return (
			<StudioPage breadcrumb={crumbs}>
				<EmptyState
					variant="error"
					title={t('Organization not found')}
					secondary={<Link to="/admin/orgs">{t('Back to organizations')}</Link>}
				/>
			</StudioPage>
		);
	}

	return (
		<StudioPage
			breadcrumb={crumbs}
			title={org.data.name}
			actions={
				<Link to={`/orgs/${org.data.organizationId}`} className="button button--primary">
					{t('Enter this organization')}
				</Link>
			}
		>
			<p className={styles.meta}>
				<span className="stat-number">
					{tWithParams('{{count}} members', { count: org.data.memberCount ?? 0 })}
				</span>
				<span aria-hidden="true">·</span>
				<span className="stat-number">
					{tWithParams('{{count}} questions', { count: org.data.questionCount ?? 0 })}
				</span>
			</p>

			{members.loading ? (
				<Skeleton variant="header" />
			) : (
				<MemberList
					members={members.data}
					invitations={[]}
					currentUid={user?.uid ?? ''}
					canManage={false}
					onChangeRole={noop}
					onRemove={noop}
					onResend={noop}
					onRevoke={noop}
					onCopyLink={noop}
				/>
			)}

			<section className={styles.invites} aria-labelledby="pending-invites-title">
				<h2 id="pending-invites-title" className={styles.sectionTitle}>
					{t('Pending invitations')}
				</h2>
				{invitations.data.length === 0 ? (
					<p className={styles.muted}>{t('No pending invitations.')}</p>
				) : (
					<ul className={styles.inviteList}>
						{invitations.data.map((invitation) => (
							<li key={invitation.invitationId} className={styles.inviteRow}>
								<span className={styles.inviteEmail} dir="ltr">
									{invitation.invitedEmail}
								</span>
								<RoleBadge role={invitation.role} />
								<span className={styles.muted}>
									{t('Expires')}{' '}
									<span className="stat-number">{dateFormat.format(invitation.expiresAt)}</span>
								</span>
								<span className={styles.inviteActions}>
									<Button
										text={t('Copy link')}
										variant="secondary"
										size="small"
										onClick={() => void resend(invitation.invitationId, true)}
									/>
									<Button
										text={t('Resend')}
										variant="secondary"
										size="small"
										onClick={() => void resend(invitation.invitationId, false)}
									/>
								</span>
							</li>
						))}
					</ul>
				)}
			</section>

			<Notice notice={notice} />
		</StudioPage>
	);
}
