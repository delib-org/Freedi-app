'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslation } from '@freedi/shared-i18n/next';
import {
  AdminInvitation,
  AdminInvitationStatus,
  AdminPermissionLevel,
  DocumentCollaborator,
} from '@freedi/shared-types';
import { useAdminContext } from '../AdminContext';
import styles from './team.module.scss';

export default function TeamPage() {
  const params = useParams();
  const router = useRouter();
  const statementId = params?.statementId as string;
  const { t, tWithParams } = useTranslation();
  const { canInviteViewers, canInviteAdmins, isOwner } = useAdminContext();

  // State
  const [invitations, setInvitations] = useState<AdminInvitation[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [collaborators, _setCollaborators] = useState<DocumentCollaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [selectedPermission, setSelectedPermission] = useState<AdminPermissionLevel>(
    isOwner ? AdminPermissionLevel.admin : AdminPermissionLevel.viewer
  );
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [newInviteLink, setNewInviteLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  // Fetch invitations and collaborators
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/admin/invitations/${statementId}`);

      if (!response.ok) {
        if (response.status === 403) {
          setError(t('ownerAccessRequired'));
        } else {
          throw new Error('Failed to fetch team data');
        }

        return;
      }

      const data = await response.json();
      setInvitations(data.invitations || []);
      // TODO: Fetch collaborators when API is ready
      // setCollaborators(data.collaborators || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [statementId, t]);

  useEffect(() => {
    if (statementId) {
      fetchData();
    }
  }, [statementId, fetchData]);

  // Redirect viewers - they cannot access team page
  useEffect(() => {
    if (!canInviteViewers) {
      router.replace(`/doc/${statementId}/admin`);
    }
  }, [canInviteViewers, router, statementId]);

  // Don't render anything while redirecting
  if (!canInviteViewers) {
    return null;
  }

  // Handle invite submission
  const handleInvite = async (e: FormEvent) => {
    e.preventDefault();

    if (!inviteEmail.trim()) return;

    setIsInviting(true);
    setInviteError(null);
    setNewInviteLink(null);

    try {
      // Non-owners can only invite viewers
      const permissionToSend = canInviteAdmins ? selectedPermission : AdminPermissionLevel.viewer;

      const response = await fetch(`/api/admin/invitations/${statementId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: inviteEmail.trim().toLowerCase(),
          permissionLevel: permissionToSend,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create invitation');
      }

      setNewInviteLink(data.inviteLink);
      setInviteEmail('');
      // Refresh the list
      fetchData();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to send invitation');
    } finally {
      setIsInviting(false);
    }
  };

  // Handle invitation revocation
  const handleRevoke = async (invitationId: string) => {
    if (!confirm(t('confirmRevokeInvitation'))) return;

    setRevoking(invitationId);

    try {
      const response = await fetch(
        `/api/admin/invitations/${statementId}/${invitationId}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to revoke invitation');
      }

      // Refresh the list
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke invitation');
    } finally {
      setRevoking(null);
    }
  };

  // Copy invite link to clipboard
  const handleCopyLink = async () => {
    if (!newInviteLink) return;

    try {
      await navigator.clipboard.writeText(newInviteLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (err) {
      console.error('Failed to copy link', err);
    }
  };

  // Format date
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Get time remaining
  const getTimeRemaining = (expiresAt: number) => {
    const now = Date.now();
    const remaining = expiresAt - now;

    if (remaining <= 0) return t('expired');

    const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) {
      return tWithParams('expiresInDays', { days });
    }

    return tWithParams('expiresInHours', { hours });
  };

  if (loading) {
    return (
      <div className={styles.teamPage}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <p>{t('loading')}</p>
        </div>
      </div>
    );
  }

  const pendingInvitations = invitations.filter(
    (inv) => inv.status === AdminInvitationStatus.pending
  );
  const otherInvitations = invitations.filter(
    (inv) => inv.status !== AdminInvitationStatus.pending
  );

  return (
    <div className={styles.teamPage}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('teamManagement')}</h1>
        <p className={styles.subtitle}>{t('teamManagementDescription')}</p>
      </header>

      {error && <div className={styles.errorMessage}>{error}</div>}

      {/* Invite Team Member Section */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>
            {canInviteAdmins ? t('inviteTeamMember') : t('inviteViewer')}
          </h2>
          {!canInviteAdmins && (
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {t('onlyOwnersCanInviteAdmins')}
            </p>
          )}
        </div>

        <form onSubmit={handleInvite} className={styles.inviteForm}>
          <div className={styles.inputGroup}>
            <label htmlFor="inviteEmail" className={styles.inputLabel}>
              {t('emailAddress')}
            </label>
            <input
              id="inviteEmail"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder={t('enterEmailAddress')}
              className={styles.emailInput}
              disabled={isInviting}
              required
            />
          </div>

          {canInviteAdmins && (
            <div className={styles.inputGroup}>
              <label htmlFor="permissionLevel" className={styles.inputLabel}>
                {t('permissionLevel')}
              </label>
              <select
                id="permissionLevel"
                value={selectedPermission}
                onChange={(e) => setSelectedPermission(e.target.value as AdminPermissionLevel)}
                className={styles.emailInput}
                disabled={isInviting}
              >
                <option value={AdminPermissionLevel.admin}>{t('admin')}</option>
                <option value={AdminPermissionLevel.viewer}>{t('viewer')}</option>
              </select>
            </div>
          )}

          <button
            type="submit"
            className={styles.inviteButton}
            disabled={isInviting || !inviteEmail.trim()}
          >
            {isInviting ? (
              <>
                <span className={styles.spinner} style={{ width: 16, height: 16 }} />
                {t('sending')}
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <line x1="20" y1="8" x2="20" y2="14" />
                  <line x1="23" y1="11" x2="17" y2="11" />
                </svg>
                {t('sendInvitation')}
              </>
            )}
          </button>
        </form>

        {inviteError && (
          <div className={styles.errorMessage}>{inviteError}</div>
        )}

        {newInviteLink && (
          <div className={styles.inviteLinkContainer}>
            <p className={styles.inviteLinkTitle}>{t('invitationCreated')}</p>
            <div className={styles.inviteLinkWrapper}>
              <input
                type="text"
                value={newInviteLink}
                readOnly
                className={styles.inviteLinkInput}
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className={styles.copyButton}
              >
                {copiedLink ? t('copied') : t('copyLink')}
              </button>
            </div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
              {t('shareInviteLinkNote')}
            </p>
          </div>
        )}
      </section>

      {/* Pending Invitations Section */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t('pendingInvitations')}</h2>
        </div>

        {pendingInvitations.length === 0 ? (
          <div className={styles.emptyState}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            <p>{t('noPendingInvitations')}</p>
          </div>
        ) : (
          <div className={styles.invitationsList}>
            {pendingInvitations.map((invitation) => (
              <div key={invitation.invitationId} className={styles.invitationCard}>
                <div className={styles.invitationInfo}>
                  <p className={styles.invitationEmail}>{invitation.invitedEmail}</p>
                  <p className={styles.invitationMeta}>
                    {t('invitedBy')} {invitation.invitedByDisplayName} {' | '}
                    {getTimeRemaining(invitation.expiresAt)}
                  </p>
                </div>
                <div className={styles.invitationActions}>
                  <span className={`${styles.statusBadge} ${styles.pending}`}>
                    {t('pending')}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRevoke(invitation.invitationId)}
                    disabled={revoking === invitation.invitationId}
                    className={styles.revokeButton}
                  >
                    {revoking === invitation.invitationId ? t('revoking') : t('revoke')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent Invitation History */}
      {otherInvitations.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{t('invitationHistory')}</h2>
          </div>

          <div className={styles.invitationsList}>
            {otherInvitations.map((invitation) => (
              <div key={invitation.invitationId} className={styles.invitationCard}>
                <div className={styles.invitationInfo}>
                  <p className={styles.invitationEmail}>{invitation.invitedEmail}</p>
                  <p className={styles.invitationMeta}>
                    {t('invitedBy')} {invitation.invitedByDisplayName} {' | '}
                    {formatDate(invitation.createdAt)}
                    {invitation.status === AdminInvitationStatus.accepted && invitation.acceptedAt && (
                      <> | {t('acceptedOn')} {formatDate(invitation.acceptedAt)}</>
                    )}
                  </p>
                </div>
                <div className={styles.invitationActions}>
                  <span className={`${styles.statusBadge} ${styles[invitation.status]}`}>
                    {t(invitation.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Current Collaborators Section */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t('currentCollaborators')}</h2>
        </div>

        {collaborators.length === 0 ? (
          <div className={styles.emptyState}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87" />
              <path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
            <p>{t('noCollaboratorsYet')}</p>
          </div>
        ) : (
          <div className={styles.collaboratorsList}>
            {collaborators.map((collaborator) => (
              <div key={collaborator.userId} className={styles.collaboratorCard}>
                <div className={styles.collaboratorInfo}>
                  <p className={styles.collaboratorName}>{collaborator.displayName}</p>
                  <p className={styles.collaboratorEmail}>{collaborator.email}</p>
                  <p className={styles.collaboratorMeta}>
                    {t('addedOn')} {formatDate(collaborator.addedAt)}
                  </p>
                </div>
                <div className={styles.invitationActions}>
                  <span className={`${styles.permissionBadge} ${styles[collaborator.permissionLevel]}`}>
                    {t(collaborator.permissionLevel)}
                  </span>
                  {collaborator.permissionLevel !== AdminPermissionLevel.owner && (
                    <button type="button" className={styles.removeButton}>
                      {t('remove')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
