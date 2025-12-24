import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDocumentForSigning } from '@/lib/firebase/queries';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkAdminAccess, AdminAccessResult } from '@/lib/utils/adminAccess';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { AdminPermissionLevel } from '@freedi/shared-types';
import { AdminProvider } from './AdminContext';
import AdminSidebar from './AdminSidebar';
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
