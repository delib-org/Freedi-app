'use client';

import { useAdminContext } from './AdminContext';
import styles from './admin.module.scss';

interface QuickActionsProps {
  statementId: string;
}

export default function QuickActions({ statementId }: QuickActionsProps) {
  const { canManageSettings, canExport } = useAdminContext();

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Quick Actions</h2>
      <div style={{ display: 'flex', gap: 'var(--spacing-md)', flexWrap: 'wrap' }}>
        <a
          href={`/doc/${statementId}/admin/users`}
          className={styles.exportButton}
          style={{ textDecoration: 'none' }}
        >
          View All Users
        </a>

        {canManageSettings && (
          <a
            href={`/doc/${statementId}/admin/settings`}
            className={styles.exportButton}
            style={{ textDecoration: 'none', background: 'var(--text-secondary)' }}
          >
            Document Settings
          </a>
        )}

        {canExport && (
          <>
            <a
              href={`/api/admin/export/${statementId}`}
              className={styles.exportButton}
              style={{ textDecoration: 'none', background: 'var(--agree)' }}
            >
              Export Users
            </a>
            <a
              href={`/api/admin/export-detailed/${statementId}`}
              className={styles.exportButton}
              style={{ textDecoration: 'none', background: 'var(--btn-primary)' }}
              title="Export document with all paragraphs, comments, and demographics"
            >
              Export Detailed
            </a>
            <a
              href={`/api/admin/export-demographic/${statementId}`}
              className={styles.exportButton}
              style={{ textDecoration: 'none', background: 'var(--warning, #f59e0b)' }}
              title="Export demographic comparison data - shows how each segment interacted with each paragraph"
            >
              Export Demographic Analysis
            </a>
          </>
        )}
      </div>
    </section>
  );
}
