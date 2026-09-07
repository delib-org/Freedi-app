'use client';

import { FormEvent, useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { SurveyAdminRole } from '@freedi/shared-types';
import { authedFetch } from '@/lib/api/authedFetch';
import { logError } from '@/lib/utils/errorHandling';
import {
  PendingInvitation,
  UseSurveyAdminsResult,
} from '@/hooks/useSurveyAdmins';
import styles from './SurveyAdmins.module.scss';

interface SurveyAdminsPanelProps {
  surveyId: string;
  /** The roster state, owned by the parent so other tabs share the access it resolves. */
  roster: UseSurveyAdminsResult;
}

/**
 * Manage who else can administer a survey.
 *
 * Only the survey's owner can invite, change roles or remove access; everyone
 * with access can see the roster, so a co-admin knows who else is here.
 */
export default function SurveyAdminsPanel({ surveyId, roster }: SurveyAdminsPanelProps) {
  const { t } = useTranslation();
  const { access, admins, invitations, isLoading, error, refresh } = roster;

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<SurveyAdminRole>(SurveyAdminRole.viewer);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [manualLink, setManualLink] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canManage = access?.canManageAdmins ?? false;

  const roleLabel = (value: SurveyAdminRole) =>
    value === SurveyAdminRole.editor ? t('adminCanEdit') : t('adminViewOnly');

  const handleInvite = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setManualLink(null);
    setIsSubmitting(true);

    try {
      const response = await authedFetch(`/api/surveys/${surveyId}/admins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        inviteLink?: string;
        emailSent?: boolean;
      };

      if (!response.ok) {
        setFormError(data.error || t('inviteAdminFailed'));

        return;
      }

      setEmail('');

      // When mail is not configured or delivery failed, the invite is still
      // valid — surface the link so the owner can pass it on themselves.
      if (!data.emailSent && data.inviteLink) {
        setManualLink(data.inviteLink);
      }

      await refresh();
    } catch (err) {
      logError(err, { operation: 'SurveyAdminsPanel.handleInvite', metadata: { surveyId } });
      setFormError(t('inviteAdminFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRoleChange = async (userId: string, nextRole: SurveyAdminRole) => {
    setBusyId(userId);
    setFormError(null);

    try {
      const response = await authedFetch(`/api/surveys/${surveyId}/admins/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setFormError(data.error || t('updateAdminRoleFailed'));

        return;
      }

      await refresh();
    } catch (err) {
      logError(err, { operation: 'SurveyAdminsPanel.handleRoleChange', metadata: { surveyId } });
      setFormError(t('updateAdminRoleFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (userId: string) => {
    setBusyId(userId);
    setFormError(null);

    try {
      const response = await authedFetch(`/api/surveys/${surveyId}/admins/${userId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setFormError(data.error || t('removeAdminFailed'));

        return;
      }

      await refresh();
    } catch (err) {
      logError(err, { operation: 'SurveyAdminsPanel.handleRemove', metadata: { surveyId } });
      setFormError(t('removeAdminFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const handleRevoke = async (invitation: PendingInvitation) => {
    setBusyId(invitation.invitationId);
    setFormError(null);

    try {
      const response = await authedFetch(
        `/api/surveys/${surveyId}/admins/invitations/${invitation.invitationId}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setFormError(data.error || t('cancelInvitationFailed'));

        return;
      }

      await refresh();
    } catch (err) {
      logError(err, { operation: 'SurveyAdminsPanel.handleRevoke', metadata: { surveyId } });
      setFormError(t('cancelInvitationFailed'));
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading) {
    return <p className={styles.intro}>{t('loading')}</p>;
  }

  return (
    <div className={styles.panel}>
      <p className={styles.intro}>{t('surveyAdminsIntro')}</p>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {formError && <p className={styles.error} role="alert">{formError}</p>}

      {canManage && (
        <form className={styles.inviteForm} onSubmit={handleInvite}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="survey-admin-email">
              {t('emailAddress')}
            </label>
            <input
              id="survey-admin-email"
              className={styles.input}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              required
              disabled={isSubmitting}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="survey-admin-role">
              {t('permission')}
            </label>
            <select
              id="survey-admin-role"
              className={styles.select}
              value={role}
              onChange={(event) => setRole(event.target.value as SurveyAdminRole)}
              disabled={isSubmitting}
            >
              <option value={SurveyAdminRole.viewer}>{t('adminViewOnly')}</option>
              <option value={SurveyAdminRole.editor}>{t('adminCanEdit')}</option>
            </select>
          </div>

          <button className={styles.primaryButton} type="submit" disabled={isSubmitting}>
            {isSubmitting ? t('sending') : t('sendInvitation')}
          </button>

          <p className={styles.roleHint}>
            {role === SurveyAdminRole.editor ? t('adminCanEditHint') : t('adminViewOnlyHint')}
          </p>
        </form>
      )}

      {manualLink && (
        <p className={styles.notice}>
          {t('invitationEmailNotSent')} {manualLink}
        </p>
      )}

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('peopleWithAccess')}</h3>
        <ul className={styles.list}>
          <li className={styles.row}>
            <div className={styles.rowMain}>
              <span className={styles.rowName}>{t('surveyOwner')}</span>
              <span className={styles.rowMeta}>{t('surveyOwnerHint')}</span>
            </div>
            <span className={`${styles.badge} ${styles.badgeOwner}`}>{t('owner')}</span>
          </li>

          {admins.map((admin) => (
            <li className={styles.row} key={admin.surveyAdminId}>
              <div className={styles.rowMain}>
                <span className={styles.rowName}>{admin.displayName || admin.email}</span>
                <span className={styles.rowMeta}>{admin.email}</span>
              </div>

              {canManage ? (
                <div className={styles.rowActions}>
                  <label className={styles.label} htmlFor={`role-${admin.userId}`}>
                    <span className="sr-only">{t('permission')}</span>
                  </label>
                  <select
                    id={`role-${admin.userId}`}
                    className={styles.select}
                    value={admin.role}
                    disabled={busyId === admin.userId}
                    onChange={(event) =>
                      handleRoleChange(admin.userId, event.target.value as SurveyAdminRole)
                    }
                    aria-label={t('permission')}
                  >
                    <option value={SurveyAdminRole.viewer}>{t('adminViewOnly')}</option>
                    <option value={SurveyAdminRole.editor}>{t('adminCanEdit')}</option>
                  </select>
                  <button
                    className={styles.linkButton}
                    type="button"
                    disabled={busyId === admin.userId}
                    onClick={() => handleRemove(admin.userId)}
                  >
                    {t('removeAccess')}
                  </button>
                </div>
              ) : (
                <span
                  className={`${styles.badge} ${
                    admin.role === SurveyAdminRole.editor ? styles.badgeEditor : ''
                  }`}
                >
                  {roleLabel(admin.role)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {canManage && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('pendingInvitations')}</h3>

          {invitations.length === 0 ? (
            <p className={styles.empty}>{t('noPendingInvitations')}</p>
          ) : (
            <ul className={styles.list}>
              {invitations.map((invitation) => (
                <li className={styles.row} key={invitation.invitationId}>
                  <div className={styles.rowMain}>
                    <span className={styles.rowName}>{invitation.invitedEmail}</span>
                    <span className={styles.rowMeta}>
                      {roleLabel(invitation.role)} ·{' '}
                      {new Date(invitation.expiresAt).toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    className={styles.linkButton}
                    type="button"
                    disabled={busyId === invitation.invitationId}
                    onClick={() => handleRevoke(invitation)}
                  >
                    {t('cancelInvitation')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
