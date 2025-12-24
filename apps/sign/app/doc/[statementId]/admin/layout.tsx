import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDocumentForSigning } from '@/lib/firebase/queries';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkAdminAccess, AdminAccessResult } from '@/lib/utils/adminAccess';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { AdminPermissionLevel } from '@freedi/shared-types';
import { AdminProvider } from './AdminContext';
import LanguageSwitcher from '@/components/admin/LanguageSwitcher';
import styles from './admin.module.scss';

interface AdminLayoutProps {
  children: React.ReactNode;
  params: Promise<{ statementId: string }>;
}

export default async function AdminLayout({
  children,
  params,
}: AdminLayoutProps) {
  const { statementId } = await params;
  const cookieStore = await cookies();
  const userId = getUserIdFromCookie(cookieStore.toString());

  // Check if user is logged in
  if (!userId) {
    redirect(`/login?redirect=/doc/${statementId}/admin`);
  }

  // Get document to verify it exists
  const document = await getDocumentForSigning(statementId);

  if (!document) {
    redirect('/');
  }

  // Check admin access using the new utility
  const { db } = getFirebaseAdmin();
  const accessResult: AdminAccessResult = await checkAdminAccess(db, statementId, userId);

  if (!accessResult.isAdmin) {
    redirect(`/doc/${statementId}`);
  }

  // Permission flags for conditional rendering
  const canManageSettings = accessResult.permissionLevel !== AdminPermissionLevel.viewer;
  const canCreateViewerLinks = accessResult.permissionLevel !== AdminPermissionLevel.viewer;

  return (
    <div className={styles.adminLayout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarHeaderTop}>
            <h2 className={styles.sidebarTitle}>Admin Panel</h2>
            <LanguageSwitcher />
          </div>
          <p className={styles.documentTitle}>{document.statement}</p>
        </div>

        <nav className={styles.nav}>
          <Link href={`/doc/${statementId}/admin`} className={styles.navLink}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            Dashboard
          </Link>

          <Link href={`/doc/${statementId}/admin/users`} className={styles.navLink}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Users
          </Link>

          <Link href={`/doc/${statementId}/admin/collaboration`} className={styles.navLink}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            Collaboration Index
          </Link>

          {canCreateViewerLinks && (
            <Link href={`/doc/${statementId}/admin/team`} className={styles.navLink}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              Team
            </Link>
          )}

          {canManageSettings && (
            <Link href={`/doc/${statementId}/admin/settings`} className={styles.navLink}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Settings
            </Link>
          )}
        </nav>

        <div className={styles.sidebarFooter}>
          <Link href={`/doc/${statementId}`} className={styles.backLink}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to Document
          </Link>
        </div>
      </aside>

      <main className={styles.main}>
        <AdminProvider
          permissionLevel={accessResult.permissionLevel!}
          isOwner={accessResult.isOwner}
        >
          {children}
        </AdminProvider>
      </main>
    </div>
  );
}
