import { cookies } from 'next/headers';
import { getDocumentStats } from '@/lib/firebase/queries';
import { getUserIdFromCookie } from '@/lib/utils/user';
import ParagraphsTable from '@/components/admin/ParagraphsTable';
import QuickActions from './QuickActions';
import styles from './admin.module.scss';

interface AdminDashboardProps {
  params: Promise<{ statementId: string }>;
}

export default async function AdminDashboard({ params }: AdminDashboardProps) {
  const { statementId } = await params;
  const cookieStore = await cookies();
  const userId = getUserIdFromCookie(cookieStore.toString());

  // Get document stats
  const stats = userId ? await getDocumentStats(statementId) : null;

  return (
    <div className={styles.dashboard}>
      <header className={styles.dashboardHeader}>
        <h1 className={styles.dashboardTitle}>Dashboard</h1>
        <p className={styles.dashboardSubtitle}>
          Overview of document engagement and signatures
        </p>
      </header>

      {/* Stats Grid */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Total Participants</p>
          <p className={styles.statValue}>{stats?.totalParticipants || 0}</p>
        </div>

        <div className={styles.statCard}>
          <p className={styles.statLabel}>Signed</p>
          <p className={styles.statValue}>{stats?.signedCount || 0}</p>
          <p className={`${styles.statChange} ${styles.positive}`}>
            {stats?.totalParticipants
              ? Math.round((stats.signedCount / stats.totalParticipants) * 100)
              : 0}% of participants
          </p>
        </div>

        <div className={styles.statCard}>
          <p className={styles.statLabel}>Rejected</p>
          <p className={styles.statValue}>{stats?.rejectedCount || 0}</p>
          <p className={`${styles.statChange} ${styles.negative}`}>
            {stats?.totalParticipants
              ? Math.round((stats.rejectedCount / stats.totalParticipants) * 100)
              : 0}% of participants
          </p>
        </div>

        <div className={styles.statCard}>
          <p className={styles.statLabel}>Viewed Only</p>
          <p className={styles.statValue}>{stats?.viewedCount || 0}</p>
        </div>

        <div className={styles.statCard}>
          <p className={styles.statLabel}>Total Comments</p>
          <p className={styles.statValue}>{stats?.totalComments || 0}</p>
        </div>

        <div className={styles.statCard}>
          <p className={styles.statLabel}>Avg. Approval</p>
          <p className={styles.statValue}>
            {stats?.averageApproval ? stats.averageApproval.toFixed(2) : '0.00'}
          </p>
          <p className={styles.statChange}>scale: -1 to 1</p>
        </div>
      </div>

      {/* Top Paragraphs Section */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Most Engaged Paragraphs</h2>
        {stats?.topParagraphs && stats.topParagraphs.length > 0 ? (
          <ParagraphsTable
            paragraphs={stats.topParagraphs}
            documentId={statementId}
            userId={userId}
          />
        ) : (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 'var(--spacing-lg)' }}>
            No paragraph data available yet
          </p>
        )}
      </section>

      {/* Quick Actions */}
      <QuickActions statementId={statementId} />
    </div>
  );
}
