import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDocumentForSigning } from '@/lib/firebase/queries';
import { getUserIdFromCookies } from '@/lib/utils/user';
import { checkAdminAccess, AdminAccessResult } from '@/lib/utils/adminAccess';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { AdminPermissionLevel } from '@freedi/shared-types';
import { AdminProvider } from './AdminContext';
import AdminSidebar from './AdminSidebar';
import styles from './admin.module.scss';
import { logger } from '@/lib/utils/logger';

// Next.js route segment config - prevent caching for fresh permission checks
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
  // Use proper Next.js cookies API instead of toString()
  const userId = getUserIdFromCookies(cookieStore);

  // Debug logging for cookie issues
  logger.info(`[AdminLayout] Cookie check: userId=${userId ? userId.substring(0, 10) + '...' : 'null'}, documentId=${statementId}`);

  // Check if user is logged in
  if (!userId) {
    logger.warn(`[AdminLayout] No userId cookie found, redirecting to login`);
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

  logger.info(`[AdminLayout] Access check for userId=${userId}, documentId=${statementId}: isAdmin=${accessResult.isAdmin}, permissionLevel=${accessResult.permissionLevel}, isOwner=${accessResult.isOwner}`);

  if (!accessResult.isAdmin) {
    logger.warn(`[AdminLayout] Access denied for userId=${userId} on document=${statementId}. Redirecting to document view.`);
    redirect(`/doc/${statementId}`);
  }

  // Permission flags for conditional rendering
  const canManageSettings = accessResult.permissionLevel !== AdminPermissionLevel.viewer;
  const canCreateViewerLinks = accessResult.permissionLevel !== AdminPermissionLevel.viewer;

  return (
    <div className={styles.adminLayout}>
      <AdminSidebar
        statementId={statementId}
        documentTitle={document.statement}
        canManageSettings={canManageSettings}
        canCreateViewerLinks={canCreateViewerLinks}
      />

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
