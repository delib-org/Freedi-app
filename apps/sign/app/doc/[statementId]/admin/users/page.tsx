'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useTranslation } from '@freedi/shared-i18n/next';
import DemographicResponses from '@/components/admin/demographics/DemographicResponses';
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

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

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
                <th>{t('Reason')}</th>
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
                  <td>
                    {user.signed === 'rejected' && user.rejectionReason ? (
                      <span
                        className={styles.rejectionReason}
                        title={user.rejectionReason}
                      >
                        {user.rejectionReason.length > 50
                          ? `${user.rejectionReason.substring(0, 50)}...`
                          : user.rejectionReason}
                      </span>
                    ) : (
                      '-'
                    )}
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
    </div>
  );
}
