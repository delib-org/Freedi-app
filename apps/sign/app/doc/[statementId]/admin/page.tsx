import { cookies, headers } from 'next/headers';
import { getDocumentStats } from '@/lib/firebase/queries';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { getTranslations, detectLanguage, COOKIE_KEY } from '@freedi/shared-i18n/next';
import ParagraphsTable from '@/components/admin/ParagraphsTable';
import QuickActions from './QuickActions';
import styles from './admin.module.scss';

interface AdminDashboardProps {
  params: Promise<{ statementId: string }>;
}

export default async function AdminDashboard({ params }: AdminDashboardProps) {
  const { statementId } = await params;
  const cookieStore = await cookies();
  const headersList = await headers();
  const userId = getUserIdFromCookie(cookieStore.toString());

  // Get translations
  const cookieValue = cookieStore.get(COOKIE_KEY)?.value;
  const acceptLanguage = headersList.get('accept-language');
  const language = await detectLanguage(cookieValue, acceptLanguage);
  const { dictionary } = getTranslations(language);
  const t = (key: string) => dictionary[key] || key;

  // Get document stats
  const stats = userId ? await getDocumentStats(statementId) : null;

  return (
    <div className={styles.dashboard}>
      <header className={styles.dashboardHeader}>
        <h1 className={styles.dashboardTitle}>{t('Dashboard')}</h1>
        <p className={styles.dashboardSubtitle}>
          {t('overviewOfDocumentEngagement')}
        </p>
      </header>

      {/* Stats Grid */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>{t('totalParticipants')}</p>
          <p className={styles.statValue}>{stats?.totalParticipants || 0}</p>
        </div>

        <div className={styles.statCard}>
          <p className={styles.statLabel}>{t('signed')}</p>
          <p className={styles.statValue}>{stats?.signedCount || 0}</p>
          <p className={`${styles.statChange} ${styles.positive}`}>
            {stats?.totalParticipants
              ? Math.round((stats.signedCount / stats.totalParticipants) * 100)
              : 0}% {t('ofParticipants')}
          </p>
        </div>

        <div className={styles.statCard}>
          <p className={styles.statLabel}>{t('rejected')}</p>
          <p className={styles.statValue}>{stats?.rejectedCount || 0}</p>
          <p className={`${styles.statChange} ${styles.negative}`}>
            {stats?.totalParticipants
              ? Math.round((stats.rejectedCount / stats.totalParticipants) * 100)
              : 0}% {t('ofParticipants')}
          </p>
        </div>

        <div className={styles.statCard}>
          <p className={styles.statLabel}>{t('viewedOnly')}</p>
          <p className={styles.statValue}>{stats?.viewedCount || 0}</p>
        </div>

        <div className={styles.statCard}>
          <p className={styles.statLabel}>{t('totalComments')}</p>
          <p className={styles.statValue}>{stats?.totalComments || 0}</p>
        </div>

        <div className={styles.statCard}>
          <p className={styles.statLabel}>{t('avgApproval')}</p>
          <p className={styles.statValue}>
            {stats?.averageApproval ? stats.averageApproval.toFixed(2) : '0.00'}
          </p>
          <p className={styles.statChange}>{t('scaleMinus1To1')}</p>
        </div>
      </div>

      {/* Top Paragraphs Section */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('mostEngagedParagraphs')}</h2>
        {stats?.topParagraphs && stats.topParagraphs.length > 0 ? (
          <ParagraphsTable
            paragraphs={JSON.parse(JSON.stringify(stats.topParagraphs))}
            documentId={statementId}
            userId={userId}
          />
        ) : (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 'var(--spacing-lg)' }}>
            {t('noParagraphDataYet')}
          </p>
        )}
      </section>

      {/* Quick Actions */}
      <QuickActions statementId={statementId} />
    </div>
  );
}
