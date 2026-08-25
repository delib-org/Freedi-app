import { useState, type FC } from 'react';
import clsx from 'clsx';
import {
	OrganizationRole,
	type OrganizationInvitation,
	type OrganizationMember,
} from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Button } from '@/components/atomic/atoms/Button';
import { RoleBadge } from '@/components/atomic/atoms/RoleBadge';
import { logError } from '@/utils/logError';

/**
 * MemberList Molecule — an ARIA table of members + pending invitations.
 * Styles: styles/organisms/_member-list.scss (.member-list)
 *
 * Role changes need a callable that does not exist in v1, so the role select
 * renders disabled with a "Coming soon" tooltip. The last owner is locked.
 */
export interface MemberListProps {
	members: OrganizationMember[];
	invitations: OrganizationInvitation[];
	currentUid: string;
	canManage: boolean;
	onChangeRole: (userId: string, role: OrganizationRole) => Promise<void>;
	onRemove: (userId: string) => Promise<void>;
	onResend: (invitationId: string) => Promise<void>;
	onRevoke: (invitationId: string) => Promise<void>;
	onCopyLink: (invitationId: string) => Promise<void>;
	className?: string;
}

function initialsOf(name: string, email: string): string {
	const source = name.trim() || email.split('@')[0];
	const parts = source.split(/\s+/).filter(Boolean);
	if (parts.length === 0) return '?';
	if (parts.length === 1) return parts[0].slice(0, 2);

	return `${parts[0][0]}${parts[parts.length - 1][0]}`;
}

const ROLE_ORDER: Record<OrganizationRole, number> = {
	[OrganizationRole.owner]: 0,
	[OrganizationRole.admin]: 1,
	[OrganizationRole.viewer]: 2,
};

const MemberList: FC<MemberListProps> = ({
	members,
	invitations,
	currentUid,
	canManage,
	onChangeRole,
	onRemove,
	onResend,
	onRevoke,
	onCopyLink,
	className,
}) => {
	const { t, currentLanguage } = useTranslation();
	const [confirmingId, setConfirmingId] = useState<string | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);

	const dateFormat = new Intl.DateTimeFormat(currentLanguage, { dateStyle: 'medium' });
	const ownerCount = members.filter((m) => m.role === OrganizationRole.owner).length;
	const sorted = [...members].sort(
		(a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.displayName.localeCompare(b.displayName),
	);

	const run = async (id: string, operation: string, action: () => Promise<void>) => {
		setBusyId(id);
		try {
			await action();
		} catch (error) {
			logError(error, { operation: `MemberList.${operation}`, metadata: { id } });
		} finally {
			setBusyId(null);
			setConfirmingId(null);
		}
	};

	return (
		<div className={clsx('member-list', className)} role="table" aria-label={t('Members')}>
			<div className="member-list__head" role="rowgroup">
				<div className="member-list__row member-list__row--head" role="row">
					<span className="member-list__name" role="columnheader">
						{t('Member')}
					</span>
					<span className="member-list__role" role="columnheader">
						{t('Role')}
					</span>
					<span className="member-list__joined" role="columnheader">
						{t('Joined')}
					</span>
					<span className="member-list__actions" role="columnheader">
						<span className="visually-hidden">{t('Actions')}</span>
					</span>
				</div>
			</div>

			<div role="rowgroup">
				{sorted.map((member) => {
					const isMe = member.userId === currentUid;
					const isLastOwner = member.role === OrganizationRole.owner && ownerCount === 1;
					const isConfirming = confirmingId === member.memberId;
					const isBusy = busyId === member.memberId;

					return (
						<div
							key={member.memberId}
							className={clsx('member-list__row', isMe && 'member-list__row--me')}
							role="row"
						>
							<div className="member-list__name" role="cell">
								<span className="profile-avatar profile-avatar--medium member-list__avatar">
									<span className="profile-avatar__initials">
										{initialsOf(member.displayName, member.email)}
									</span>
								</span>
								<span className="member-list__identity">
									<span className="member-list__display-name">
										{member.displayName || member.email}
										{isMe && <span className="member-list__me">{t('You')}</span>}
									</span>
									<span className="member-list__email" dir="ltr">
										{member.email}
									</span>
								</span>
							</div>

							<div className="member-list__role" role="cell">
								<RoleBadge role={member.role} />
								{canManage && !isMe && (
									<select
										className="member-list__role-select"
										value={member.role}
										disabled
										title={t('Coming soon')}
										aria-label={t('Change role')}
										onChange={(event) =>
											void run(member.memberId, 'changeRole', () =>
												onChangeRole(member.userId, event.target.value as OrganizationRole),
											)
										}
									>
										<option value={OrganizationRole.admin}>{t('Admin')}</option>
										<option value={OrganizationRole.owner} disabled>
											{t('Owner')}
										</option>
									</select>
								)}
							</div>

							<div className="member-list__joined" role="cell">
								<span className="stat-number">{dateFormat.format(member.addedAt)}</span>
							</div>

							<div className="member-list__actions" role="cell">
								{canManage &&
									!isMe &&
									(isConfirming ? (
										<span className="member-list__confirm">
											<span className="member-list__confirm-text">{t('Remove this member?')}</span>
											<Button
												text={t('Remove')}
												variant="reject"
												size="small"
												loading={isBusy}
												onClick={() =>
													void run(member.memberId, 'remove', () => onRemove(member.userId))
												}
											/>
											<Button
												text={t('Cancel')}
												variant="secondary"
												size="small"
												disabled={isBusy}
												onClick={() => setConfirmingId(null)}
											/>
										</span>
									) : (
										<span
											className="member-list__lock"
											title={isLastOwner ? t('The last owner cannot be removed') : undefined}
										>
											<Button
												text={t('Remove')}
												variant="secondary"
												size="small"
												disabled={isLastOwner}
												onClick={() => setConfirmingId(member.memberId)}
											/>
										</span>
									))}
							</div>
						</div>
					);
				})}

				{invitations.map((invitation) => {
					const isBusy = busyId === invitation.invitationId;
					const isConfirming = confirmingId === invitation.invitationId;

					return (
						<div
							key={invitation.invitationId}
							className="member-list__row member-list__row--pending"
							role="row"
						>
							<div className="member-list__name" role="cell">
								<span className="profile-avatar profile-avatar--medium member-list__avatar member-list__avatar--pending">
									<span className="profile-avatar__initials">
										{initialsOf('', invitation.invitedEmail)}
									</span>
								</span>
								<span className="member-list__identity">
									<span className="member-list__display-name">
										<span className="member-list__email" dir="ltr">
											{invitation.invitedEmail}
										</span>
										<span className="member-list__tag">{t('Invited')}</span>
									</span>
									<span className="member-list__meta">
										{t('Expires')}{' '}
										<span className="stat-number">{dateFormat.format(invitation.expiresAt)}</span>
									</span>
								</span>
							</div>

							<div className="member-list__role" role="cell">
								<RoleBadge role={invitation.role} />
							</div>

							<div className="member-list__joined" role="cell">
								<span className="stat-number">{dateFormat.format(invitation.createdAt)}</span>
							</div>

							<div className="member-list__actions" role="cell">
								{canManage &&
									(isConfirming ? (
										<span className="member-list__confirm">
											<span className="member-list__confirm-text">
												{t('Revoke this invitation?')}
											</span>
											<Button
												text={t('Revoke')}
												variant="reject"
												size="small"
												loading={isBusy}
												onClick={() =>
													void run(invitation.invitationId, 'revoke', () =>
														onRevoke(invitation.invitationId),
													)
												}
											/>
											<Button
												text={t('Cancel')}
												variant="secondary"
												size="small"
												disabled={isBusy}
												onClick={() => setConfirmingId(null)}
											/>
										</span>
									) : (
										<>
											<Button
												text={t('Copy link')}
												variant="secondary"
												size="small"
												disabled={isBusy}
												onClick={() =>
													void run(invitation.invitationId, 'copyLink', () =>
														onCopyLink(invitation.invitationId),
													)
												}
											/>
											<Button
												text={t('Resend')}
												variant="secondary"
												size="small"
												loading={isBusy}
												onClick={() =>
													void run(invitation.invitationId, 'resend', () =>
														onResend(invitation.invitationId),
													)
												}
											/>
											<Button
												text={t('Revoke')}
												variant="secondary"
												size="small"
												disabled={isBusy}
												onClick={() => setConfirmingId(invitation.invitationId)}
											/>
										</>
									))}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
};

export default MemberList;
