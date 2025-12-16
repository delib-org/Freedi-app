'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslation } from '@freedi/shared-i18n/next';
import { googleLogin, subscribeToAuthState, getCurrentUser } from '@/lib/firebase/client';
import styles from './invite.module.scss';

interface InviteResponse {
  success: boolean;
  requiresLogin?: boolean;
  requiresGoogleLogin?: boolean;
  message?: string;
  error?: string;
  documentId?: string;
  permissionLevel?: string;
  redirectUrl?: string;
  expectedEmail?: string;
  actualEmail?: string;
}

function InvitePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t } = useTranslation();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'login-required' | 'processing' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState<string>('');
  const [errorDetails, setErrorDetails] = useState<{ expectedEmail?: string; actualEmail?: string } | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Check if user is already logged in
  useEffect(() => {
    const unsubscribe = subscribeToAuthState((user) => {
      if (user && status === 'login-required') {
        // User just logged in, process the invitation
        processInvitation();
      }
    });

    return () => unsubscribe();
  }, [status]);

  // Process invitation on mount
  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage(t('invalidInvitationLink'));

      return;
    }

    processInvitation();
  }, [token]);

  const processInvitation = async () => {
    if (!token) return;

    setStatus('processing');

    try {
      const response = await fetch(`/api/invite/accept?token=${token}`);
      const data: InviteResponse = await response.json();

      if (data.requiresLogin || data.requiresGoogleLogin) {
        setStatus('login-required');
        setMessage(data.message || t('pleaseLoginToAccept'));

        return;
      }

      if (!data.success) {
        setStatus('error');
        setMessage(data.error || data.message || t('invitationError'));

        if (data.expectedEmail && data.actualEmail) {
          setErrorDetails({
            expectedEmail: data.expectedEmail,
            actualEmail: data.actualEmail,
          });
        }

        return;
      }

      setStatus('success');
      setMessage(data.message || t('invitationAcceptedSuccess'));

      if (data.redirectUrl) {
        setRedirectUrl(data.redirectUrl);
      }
    } catch (err) {
      setStatus('error');
      setMessage(t('invitationProcessingError'));
    }
  };

  const handleLogin = async () => {
    setIsLoggingIn(true);

    try {
      await googleLogin();
      // Auth state change will trigger processInvitation
    } catch (err) {
      setStatus('error');
      setMessage(t('loginFailed'));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoToDocument = () => {
    if (redirectUrl) {
      router.push(redirectUrl);
    }
  };

  const handleTryDifferentAccount = async () => {
    // Log out first
    try {
      const auth = getCurrentUser();
      if (auth) {
        // Sign out happens via the logout function
        await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {
          // Ignore logout errors
        });
      }
      // Clear error state and show login prompt
      setErrorDetails(null);
      setStatus('login-required');
      setMessage(t('pleaseLoginWithCorrectAccount'));
    } catch (err) {
      console.error('Failed to sign out', err);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        {/* Loading State */}
        {(status === 'loading' || status === 'processing') && (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <h2>{t('processingInvitation')}</h2>
            <p>{t('pleaseWait')}</p>
          </div>
        )}

        {/* Login Required State */}
        {status === 'login-required' && (
          <div className={styles.loginState}>
            <div className={styles.icon}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="8" r="5" />
                <path d="M20 21a8 8 0 10-16 0" />
              </svg>
            </div>
            <h2>{t('loginRequired')}</h2>
            <p>{message}</p>
            <button
              onClick={handleLogin}
              disabled={isLoggingIn}
              className={styles.loginButton}
            >
              {isLoggingIn ? (
                <>
                  <span className={styles.buttonSpinner} />
                  {t('loggingIn')}
                </>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  {t('loginWithGoogle')}
                </>
              )}
            </button>
          </div>
        )}

        {/* Success State */}
        {status === 'success' && (
          <div className={styles.successState}>
            <div className={styles.successIcon}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h2>{t('invitationAccepted')}</h2>
            <p>{message}</p>
            {redirectUrl && (
              <button onClick={handleGoToDocument} className={styles.primaryButton}>
                {t('goToAdminPanel')}
              </button>
            )}
          </div>
        )}

        {/* Error State */}
        {status === 'error' && (
          <div className={styles.errorState}>
            <div className={styles.errorIcon}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h2>{t('invitationError')}</h2>
            <p>{message}</p>

            {errorDetails && (
              <div className={styles.emailMismatch}>
                <p><strong>{t('expectedEmail')}:</strong> {errorDetails.expectedEmail}</p>
                <p><strong>{t('yourEmail')}:</strong> {errorDetails.actualEmail}</p>
                <button
                  onClick={handleTryDifferentAccount}
                  className={styles.secondaryButton}
                >
                  {t('loginWithDifferentAccount')}
                </button>
              </div>
            )}

            <a href="/" className={styles.homeLink}>
              {t('backToHome')}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>Loading...</p>
          </div>
        </div>
      </div>
    }>
      <InvitePageContent />
    </Suspense>
  );
}
