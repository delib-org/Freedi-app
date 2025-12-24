'use client';

import { useTranslation } from '@freedi/shared-i18n/next';
import { useAdminContext } from './AdminContext';
import styles from './admin.module.scss';

interface QuickActionsProps {
  statementId: string;
}

export default function QuickActions({ statementId }: QuickActionsProps) {
  const { t } = useTranslation();
  const { canManageSettings, canExport } = useAdminContext();

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{t('quickActions')}</h2>
      <div style={{ display: 'flex', gap: 'var(--spacing-md)', flexWrap: 'wrap' }}>
        <a
          href={`/doc/${statementId}/admin/users`}
          className={styles.exportButton}
          style={{ textDecoration: 'none' }}
        >
          {t('viewAllUsers')}
        </a>

        {canManageSettings && (
          <a
            href={`/doc/${statementId}/admin/settings`}
            className={styles.exportButton}
            style={{ textDecoration: 'none', background: 'var(--text-secondary)' }}
          >
            {t('documentSettings')}
          </a>
        )}

        {canExport && (
          <>
            <a
              href={`/api/admin/export/${statementId}`}
              className={styles.exportButton}
              style={{ textDecoration: 'none', background: 'var(--agree)' }}
            >
              {t('exportUsers')}
            </a>
            <a
              href={`/api/admin/export-detailed/${statementId}`}
              className={styles.exportButton}
              style={{ textDecoration: 'none', background: 'var(--btn-primary)' }}
              title={t('exportDetailedTitle')}
            >
              {t('exportDetailed')}
            </a>
            <a
              href={`/api/admin/export-demographic/${statementId}`}
              className={styles.exportButton}
              style={{ textDecoration: 'none', background: 'var(--warning, #f59e0b)' }}
              title={t('exportDemographicTitle')}
            >
              {t('exportDemographicAnalysis')}
            </a>
          </>
        )}
      </div>
    </section>
  );
}
