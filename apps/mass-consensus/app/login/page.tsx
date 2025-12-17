'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useAuth } from '@/components/auth/AuthProvider';
import styles from './login.module.scss';

/**
 * Login page with Google authentication
 */
export default function LoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading, signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Get redirect URL from query params
  const redirectUrl = searchParams.get('redirect') || '/admin/surveys';

  // Redirect if already logged in
  useEffect(() => {
    console.info('[LoginPage] Auth state:', { user: user?.email || null, isLoading, redirectUrl });
    if (user && !isLoading) {
      console.info('[LoginPage] User logged in, redirecting to:', redirectUrl);
      router.push(redirectUrl);
    }
  }, [user, isLoading, router, redirectUrl]);

  const handleSignIn = async () => {
    setError(null);
    setIsSigningIn(true);

    try {
      await signIn();
      router.push(redirectUrl);
    } catch (err) {
      console.error('Sign in error:', err);
      setError(t('loginFailed') || 'Sign in failed. Please try again.');
    } finally {
      setIsSigningIn(false);
    }
  };

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.spinner} />
        </div>
      </div>
    );
  }

  // Don't show login form if already authenticated
  if (user) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.spinner} />
          <p>{t('redirecting') || 'Redirecting...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <Link href="/" className={styles.backLink}>
          {t('backToHome') || 'Back to Home'}
        </Link>

        <div className={styles.header}>
          <h1 className={styles.title}>{t('adminSignIn') || 'Admin Sign In'}</h1>
          <p className={styles.subtitle}>
            {t('signInToManage') || 'Sign in to create and manage surveys'}
          </p>
        </div>

        {error && (
          <div className={styles.error}>
            <p>{error}</p>
          </div>
        )}

        <button
          className={styles.googleButton}
          onClick={handleSignIn}
          disabled={isSigningIn}
        >
          <svg className={styles.googleIcon} viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          <span>
            {isSigningIn
              ? (t('signingIn') || 'Signing in...')
              : (t('signInWithGoogle') || 'Sign in with Google')}
          </span>
        </button>

        <div className={styles.info}>
          <p>
            {t('signInNote') ||
              'Sign in with your Google account to create and manage surveys.'}
          </p>
        </div>
      </div>
    </div>
  );
}
