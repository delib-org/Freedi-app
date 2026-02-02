'use client';

import { useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from '@freedi/shared-i18n/next';
import { googleLogin, anonymousLogin } from '@/lib/firebase/client';
import { trackUserLogin } from '@/lib/analytics';
import styles from './login.module.scss';

export default function LoginPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Try to get redirect URL from:
  // 1. URL parameter (?redirect=/doc/...)
  // 2. Referrer (where user came from)
  // 3. Default to home
  const redirectUrl = searchParams.get('redirect') ||
    (typeof window !== 'undefined' && document.referrer ? new URL(document.referrer).pathname : '/');

  console.info('[Login] Redirect URL:', redirectUrl);

  const handleLogin = useCallback(
    async (loginFn: typeof googleLogin | typeof anonymousLogin, method: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const user = await loginFn();

        if (user) {
          console.info(`[Login] User signed in via ${method}`, { userId: user.uid });
          trackUserLogin(user.uid, method === 'Google' ? 'google' : 'anonymous');
          // Use window.location for full page reload to send new cookies to server
          window.location.href = redirectUrl;
        } else {
          setError(t('Login failed. Please try again.'));
        }
      } catch (err) {
        console.error(`[Login] ${method} login failed`, err);
        setError(t('Login failed. Please try again.'));
      } finally {
        setIsLoading(false);
      }
    },
    [redirectUrl, t]
  );

  const handleGoogleLogin = useCallback(() => {
    handleLogin(googleLogin, 'Google');
  }, [handleLogin]);

  const handleAnonymousLogin = useCallback(() => {
    handleLogin(anonymousLogin, 'anonymous');
  }, [handleLogin]);

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Freedi Sign</h1>
        <p className={styles.subtitle}>
          {t('Sign in to view and sign documents')}
        </p>

        {error && (
          <p className={styles.error}>{error}</p>
        )}

        <div className={styles.buttons}>
          <button
            type="button"
            className={styles.googleButton}
            onClick={handleGoogleLogin}
            disabled={isLoading}
          >
            <svg className={styles.icon} viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {isLoading ? t('Signing in...') : t('Sign in with Google')}
          </button>

          <div className={styles.divider}>
            <span>{t('or')}</span>
          </div>
          <button
            type="button"
            className={styles.anonymousButton}
            onClick={handleAnonymousLogin}
            disabled={isLoading}
          >
            {isLoading ? t('Signing in...') : t('Continue as guest')}
          </button>
        </div>
      </div>
    </div>
  );
}
