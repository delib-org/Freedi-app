'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import styles from './admin.module.scss';

interface DeletionBatch {
  batchId: string;
  type: 'clearTestData' | 'purgeUser' | 'deleteStatement';
  targetUserId?: string;
  targetStatementId?: string;
  deletedBy: string;
  deletedByName?: string;
  deletedAt: number;
  itemCount: number;
  status: 'active' | 'restored';
}

interface BlockedUser {
  userId: string;
  displayName?: string;
  blockedBy: string;
  blockedAt: number;
}

interface DangerZoneProps {
  statementId: string;
}

export default function DangerZone({ statementId }: DangerZoneProps) {
  const { t } = useTranslation();

  const [batches, setBatches] = useState<DeletionBatch[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/data-management/${statementId}`);
      if (res.ok) {
        const data = await res.json();
        setBatches(data.batches || []);
        setBlockedUsers(data.blockedUsers || []);
      }
    } catch {
      setError(t('Failed to load data-management info'));
    } finally {
      setLoading(false);
    }
  }, [statementId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const post = useCallback(
    async (body: Record<string, unknown>): Promise<boolean> => {
      setError('');
      setBusy(true);
      try {
        const res = await fetch(`/api/admin/data-management/${statementId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || t('Action failed'));

          return false;
        }
        await load();

        return true;
      } catch {
        setError(t('Action failed'));

        return false;
      } finally {
        setBusy(false);
      }
    },
    [statementId, load, t]
  );

  const handleClearTestData = async () => {
    const ok = await post({ action: 'clearTestData' });
    if (ok) setConfirmClear(false);
  };

  const handleRestore = async (batchId: string) => {
    await post({ action: 'restore', batchId });
  };

  const handleUnban = async (userId: string) => {
    await post({ action: 'unban', targetUserId: userId });
  };

  const formatDate = (ts: number) => new Date(ts).toLocaleString();

  const batchLabel = (type: DeletionBatch['type']) => {
    switch (type) {
      case 'clearTestData':
        return t('Cleared all test data');
      case 'purgeUser':
        return t('Deleted a user’s data');
      case 'deleteStatement':
        return t('Deleted an item');
      default:
        return type;
    }
  };

  const activeBatches = batches.filter((b) => b.status === 'active');

  return (
    <section
      className={styles.settingsSection}
      style={{ border: '1px solid var(--danger, #dc2626)', borderRadius: '8px' }}
    >
      <h2 className={styles.settingsSectionTitle} style={{ color: 'var(--danger, #dc2626)' }}>
        {t('Danger Zone')}
      </h2>
      <p className={styles.settingDescription} style={{ marginBottom: 'var(--spacing-md)' }}>
        {t('Remove participant data used for testing, or clean up abusive content. Every deletion can be restored from the recycle bin below.')}
      </p>

      {error && (
        <p style={{ color: 'var(--danger, #dc2626)', marginBottom: 'var(--spacing-md)' }}>{error}</p>
      )}

      {/* Clear all test data */}
      <div className={styles.settingRow}>
        <div className={styles.settingInfo}>
          <p className={styles.settingLabel}>{t('Clear all test data')}</p>
          <p className={styles.settingDescription}>
            {t('Removes every signature, comment, suggestion, vote, approval and survey response on this document. The document text and its paragraphs are kept.')}
          </p>
        </div>
        {!confirmClear ? (
          <button
            type="button"
            className={styles.exportButton}
            style={{ background: 'var(--danger, #dc2626)' }}
            onClick={() => setConfirmClear(true)}
            disabled={busy}
          >
            {t('Clear test data')}
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
            <button
              type="button"
              className={styles.exportButton}
              style={{ background: 'var(--danger, #dc2626)' }}
              onClick={handleClearTestData}
              disabled={busy}
            >
              {busy ? t('Working...') : t('Yes, clear everything')}
            </button>
            <button
              type="button"
              className={styles.exportButton}
              style={{ background: 'var(--text-secondary)' }}
              onClick={() => setConfirmClear(false)}
              disabled={busy}
            >
              {t('Cancel')}
            </button>
          </div>
        )}
      </div>

      {/* Recycle bin */}
      <div style={{ marginTop: 'var(--spacing-lg)' }}>
        <h3 className={styles.settingLabel}>{t('Recycle bin')}</h3>
        <p className={styles.settingDescription} style={{ marginBottom: 'var(--spacing-sm)' }}>
          {t('Restore data that was deleted by mistake.')}
        </p>
        {loading ? (
          <p className={styles.settingDescription}>{t('Loading...')}</p>
        ) : activeBatches.length === 0 ? (
          <p className={styles.settingDescription}>{t('Nothing has been deleted.')}</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {activeBatches.map((b) => (
              <li
                key={b.batchId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 'var(--spacing-md)',
                  padding: 'var(--spacing-sm) 0',
                  borderBottom: '1px solid var(--border, #e5e7eb)',
                }}
              >
                <div>
                  <strong>{batchLabel(b.type)}</strong>
                  <br />
                  <small style={{ color: 'var(--text-caption)' }}>
                    {b.itemCount} {t('items')} · {formatDate(b.deletedAt)}
                    {b.deletedByName ? ` · ${b.deletedByName}` : ''}
                  </small>
                </div>
                <button
                  type="button"
                  className={styles.exportButton}
                  style={{ background: 'var(--agree)' }}
                  onClick={() => handleRestore(b.batchId)}
                  disabled={busy}
                >
                  {t('Restore')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Blocked users */}
      <div style={{ marginTop: 'var(--spacing-lg)' }}>
        <h3 className={styles.settingLabel}>{t('Blocked users')}</h3>
        <p className={styles.settingDescription} style={{ marginBottom: 'var(--spacing-sm)' }}>
          {t('Blocked users cannot sign, comment, suggest, vote or approve on this document.')}
        </p>
        {loading ? (
          <p className={styles.settingDescription}>{t('Loading...')}</p>
        ) : blockedUsers.length === 0 ? (
          <p className={styles.settingDescription}>{t('No blocked users.')}</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {blockedUsers.map((u) => (
              <li
                key={u.userId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 'var(--spacing-md)',
                  padding: 'var(--spacing-sm) 0',
                  borderBottom: '1px solid var(--border, #e5e7eb)',
                }}
              >
                <div>
                  <strong>{u.displayName || t('Anonymous')}</strong>
                  <br />
                  <small style={{ color: 'var(--text-caption)' }}>
                    {u.userId.substring(0, 12)}… · {formatDate(u.blockedAt)}
                  </small>
                </div>
                <button
                  type="button"
                  className={styles.exportButton}
                  style={{ background: 'var(--text-secondary)' }}
                  onClick={() => handleUnban(u.userId)}
                  disabled={busy}
                >
                  {t('Unblock')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
