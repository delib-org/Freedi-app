'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useTranslation } from '@freedi/shared-i18n/next';
import DemographicResponses from '@/components/admin/demographics/DemographicResponses';
import Modal from '@/components/shared/Modal';
import { useAdminContext } from '../AdminContext';
import styles from '../admin.module.scss';

interface User {
  odlUserId: string;
  odlUserDisplayName: string;
  signed: 'signed' | 'rejected' | 'viewed' | 'pending';
  signedAt: number | null;
  approvalsCount: number;
  commentsCount: number;
  rejectionReason?: string;
  satisfaction?: number;
  satisfactionReason?: string;
}

export default function AdminUsersPage() {
  const params = useParams();
  const statementId = params.statementId as string;
  const { t } = useTranslation();
  const { canExport } = useAdminContext();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [exporting, setExporting] = useState(false);
  const [exportingDetailed, setExportingDetailed] = useState(false);
  const [bannedIds, setBannedIds] = useState<Set<string>>(new Set());
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [reasonUser, setReasonUser] = useState<User | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search) params.set('search', search);

      const response = await fetch(`/api/admin/users/${statementId}?${params}`);
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  }, [statementId, statusFilter, search]);

  const fetchBanned = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/data-management/${statementId}`);
      if (res.ok) {
        const data = await res.json();
        setBannedIds(new Set((data.blockedUsers || []).map((u: { userId: string }) => u.userId)));
      }
    } catch (error) {
      console.error('Failed to fetch blocked users:', error);
    }
  }, [statementId]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    fetchBanned();
  }, [fetchBanned]);

  const runAction = useCallback(
    async (userId: string, body: Record<string, unknown>) => {
      setActionUserId(userId);
      try {
        const res = await fetch(`/api/admin/data-management/${statementId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          console.error('Action failed:', data.error);
        }
      } catch (error) {
        console.error('Action failed:', error);
      } finally {
        setActionUserId(null);
        await Promise.all([fetchUsers(), fetchBanned()]);
      }
    },
    [statementId, fetchUsers, fetchBanned]
  );

  const handlePurgeUser = async (user: User) => {
    await runAction(user.odlUserId, { action: 'purgeUser', targetUserId: user.odlUserId });
    setConfirmDeleteId(null);
  };

  const handleToggleBan = async (user: User) => {
    const isBanned = bannedIds.has(user.odlUserId);
    await runAction(user.odlUserId, {
      action: isBanned ? 'unban' : 'ban',
      targetUserId: user.odlUserId,
      targetUserName: user.odlUserDisplayName,
    });
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const response = await fetch(`/api/admin/export/${statementId}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `document-users-${statementId}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
      }
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setExporting(false);
    }
  };

  const handleDetailedExport = async () => {
    try {
      setExportingDetailed(true);
      const response = await fetch(`/api/admin/export-detailed/${statementId}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `document-detailed-${statementId}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
      }
    } catch (error) {
      console.error('Detailed export failed:', error);
    } finally {
      setExportingDetailed(false);
    }
  };

  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleDateString();
  };

  const formatSatisfaction = (satisfaction?: number) => {
    if (satisfaction === undefined) return '-';

    const labels: Record<string, string> = {
      '-1': t('Very unsatisfied'),
      '-0.5': t('Unsatisfied'),
      '0': t('Neutral'),
      '0.5': t('Satisfied'),
      '1': t('Very satisfied'),
    };
    const label = labels[String(satisfaction)] ?? String(satisfaction);
    const sign = satisfaction > 0 ? '+' : '';

    return `${label} (${sign}${satisfaction})`;
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'signed':
        return styles.signed;
      case 'rejected':
        return styles.rejected;
      case 'viewed':
        return styles.viewed;
      default:
        return styles.pending;
    }
  };

  return (
    <div className={styles.usersPage}>
      <header className={styles.dashboardHeader}>
        <h1 className={styles.dashboardTitle}>{t('Users')}</h1>
        <p className={styles.dashboardSubtitle}>
          {t('Manage document participants')}
        </p>
      </header>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder={t('Search users...')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">{t('All Status')}</option>
          <option value="signed">{t('Signed')}</option>
          <option value="rejected">{t('Rejected')}</option>
          <option value="viewed">{t('Viewed')}</option>
        </select>

        {canExport && (
          <>
            <button
              className={styles.exportButton}
              onClick={handleExport}
              disabled={exporting}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {exporting ? t('Exporting...') : t('Export Users')}
            </button>

            <button
              className={styles.exportButton}
              onClick={handleDetailedExport}
              disabled={exportingDetailed}
              title={t('Export document with all paragraphs, comments, and demographics')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              {exportingDetailed ? t('Exporting...') : t('Export Detailed')}
            </button>
          </>
        )}
      </div>

      {/* Users Table */}
      <section className={styles.section}>
        {loading ? (
          <p style={{ textAlign: 'center', padding: 'var(--spacing-lg)', color: 'var(--text-secondary)' }}>
            {t('Loading...')}
          </p>
        ) : users.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 'var(--spacing-lg)', color: 'var(--text-secondary)' }}>
            {t('No users found')}
          </p>
        ) : (
          <table className={styles.usersTable}>
            <thead>
              <tr>
                <th>{t('User')}</th>
                <th>{t('Status')}</th>
                <th>{t('Date')}</th>
                <th>{t('Approvals')}</th>
                <th>{t('Comments')}</th>
                <th>{t('Satisfaction')}</th>
                <th>{t('Reason')}</th>
                <th>{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.odlUserId}>
                  <td>
                    <div>
                      <strong>{user.odlUserDisplayName}</strong>
                      <br />
                      <small style={{ color: 'var(--text-caption)' }}>
                        {user.odlUserId.substring(0, 12)}...
                      </small>
                    </div>
                  </td>
                  <td>
                    <span className={`${styles.statusBadge} ${getStatusClass(user.signed)}`}>
                      {t(user.signed.charAt(0).toUpperCase() + user.signed.slice(1))}
                    </span>
                  </td>
                  <td>{formatDate(user.signedAt)}</td>
                  <td>{user.approvalsCount}</td>
                  <td>{user.commentsCount}</td>
                  <td>{formatSatisfaction(user.satisfaction)}</td>
                  <td>
                    {(() => {
                      const reason =
                        (user.signed === 'rejected' && user.rejectionReason) ||
                        user.satisfactionReason;

                      if (!reason) return '-';

                      const isTruncated = reason.length > 50;

                      return (
                        <button
                          type="button"
                          className={styles.reasonCell}
                          onClick={() => setReasonUser(user)}
                          title={t('Show full feedback')}
                          aria-haspopup="dialog"
                          aria-label={`${t('Show full feedback')} — ${user.odlUserDisplayName}`}
                        >
                          {isTruncated ? `${reason.substring(0, 50)}…` : reason}
                        </button>
                      );
                    })()}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                      {confirmDeleteId === user.odlUserId ? (
                        <>
                          <button
                            type="button"
                            className={styles.exportButton}
                            style={{ background: 'var(--danger, #dc2626)', padding: '0.25rem 0.5rem' }}
                            onClick={() => handlePurgeUser(user)}
                            disabled={actionUserId === user.odlUserId}
                          >
                            {actionUserId === user.odlUserId ? t('Working...') : t('Confirm delete')}
                          </button>
                          <button
                            type="button"
                            className={styles.exportButton}
                            style={{ background: 'var(--text-secondary)', padding: '0.25rem 0.5rem' }}
                            onClick={() => setConfirmDeleteId(null)}
                            disabled={actionUserId === user.odlUserId}
                          >
                            {t('Cancel')}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className={styles.exportButton}
                            style={{ background: 'var(--danger, #dc2626)', padding: '0.25rem 0.5rem' }}
                            onClick={() => setConfirmDeleteId(user.odlUserId)}
                            disabled={actionUserId === user.odlUserId}
                            title={t('Delete all of this user’s data on this document (restorable)')}
                          >
                            {t('Delete data')}
                          </button>
                          <button
                            type="button"
                            className={styles.exportButton}
                            style={{
                              background: bannedIds.has(user.odlUserId) ? 'var(--agree)' : 'var(--warning, #f59e0b)',
                              padding: '0.25rem 0.5rem',
                            }}
                            onClick={() => handleToggleBan(user)}
                            disabled={actionUserId === user.odlUserId}
                          >
                            {bannedIds.has(user.odlUserId) ? t('Unblock') : t('Block')}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Demographics Survey Responses */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('Demographics Survey Responses')}</h2>
        <DemographicResponses documentId={statementId} />
      </section>

      {/* Full feedback modal */}
      {reasonUser && (
        <Modal
          title={reasonUser.odlUserDisplayName || t('User feedback')}
          onClose={() => setReasonUser(null)}
          size="small"
          direction="rtl"
        >
          <div className={styles.feedbackModal}>
            {reasonUser.rejectionReason && (
              <div className={styles.feedbackSection}>
                <h3 className={styles.feedbackLabel}>{t('Rejection reason')}</h3>
                <p className={styles.feedbackText}>{reasonUser.rejectionReason}</p>
              </div>
            )}
            {reasonUser.satisfactionReason && (
              <div className={styles.feedbackSection}>
                <h3 className={styles.feedbackLabel}>{t('Satisfaction comment')}</h3>
                <p className={styles.feedbackText}>{reasonUser.satisfactionReason}</p>
              </div>
            )}
            {!reasonUser.rejectionReason && !reasonUser.satisfactionReason && (
              <p className={styles.feedbackText}>{t('No feedback')}</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
