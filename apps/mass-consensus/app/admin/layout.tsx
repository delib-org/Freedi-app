'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import AdminHeader from '@/components/layout/AdminHeader';
import styles from '@/components/layout/Layout.module.scss';

interface AdminLayoutProps {
  children: React.ReactNode;
}

/**
 * Admin layout with authentication protection and header navigation
 */
export default function AdminLayout({ children }: AdminLayoutProps) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    console.info('[AdminLayout] Auth state:', { isLoading, isAuthenticated });
    // Redirect to login if not authenticated
    if (!isLoading && !isAuthenticated) {
      console.info('[AdminLayout] Redirecting to login...');
      router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
    }
  }, [isAuthenticated, isLoading, router]);

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className={styles.protectedLoading}>
        <div className={styles.spinner} />
        <p>Loading...</p>
      </div>
    );
  }

  // Don't render admin content if not authenticated
  if (!isAuthenticated) {
    return (
      <div className={styles.protectedLoading}>
        <div className={styles.spinner} />
        <p>Redirecting to login...</p>
      </div>
    );
  }

  return (
    <div className={styles.adminLayout}>
      <AdminHeader />
      <main className={styles.adminContent}>
        {children}
      </main>
    </div>
  );
}
