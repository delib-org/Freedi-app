'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from '@freedi/shared-i18n/next';
import { SurveyAdminRole } from '@freedi/shared-types';
import { authedFetch, NotAuthenticatedError } from '@/lib/api/authedFetch';
import { logError } from '@/lib/utils/errorHandling';
import styles from './invite.module.scss';

interface AcceptResponse {
  success?: boolean;
  surveyId?: string;
  surveyTitle?: string;
  role?: SurveyAdminRole;
  error?: string;
  code?: string;
}

type State =
  | { status: 'working' }
  | { status: 'accepted'; surveyId: string; surveyTitle: string; role: SurveyAdminRole }
  | { status: 'failed'; message: string };

/**
 * Landing page for the link in a survey-admin invitation email.
 *
 * The `/admin` layout has already required a signed-in user by the time this
 * renders, so the token can be redeemed straight away. The server checks that
 * the signed-in account's email matches the invited address — holding the link
 * is not by itself enough to gain access.
 */
export default function AcceptSurveyAdminInvitePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [state, setState] = useState<State>({ status: 'working' });

  // A token may only be redeemed once; React 18 mounts effects twice in dev,
  // and the second call would report "already accepted" over a real success.
  const hasRedeemed = useRef(false);

  const accept = useCallback(async () => {
    if (!token) {
      setState({ status: 'failed', message: t('invitationLinkInvalid') });

      return;
    }

    try {
      const response = await authedFetch('/api/survey-admin-invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = (await response.json().catch(() => ({}))) as AcceptResponse;

      if (!response.ok || !data.success) {
        setState({
          status: 'failed',
          message: data.error || t('invitationCouldNotBeAccepted'),
        });

        return;
      }

      setState({
        status: 'accepted',
        surveyId: data.surveyId ?? '',
        surveyTitle: data.surveyTitle ?? '',
        role: data.role ?? SurveyAdminRole.viewer,
      });
    } catch (error) {
      if (error instanceof NotAuthenticatedError) {
        router.push(`/login?redirect=${encodeURIComponent(`/admin/invite?token=${token}`)}`);

        return;
      }

      logError(error, { operation: 'AcceptSurveyAdminInvitePage.accept' });
      setState({ status: 'failed', message: t('invitationCouldNotBeAccepted') });
    }
  }, [token, t, router]);

  useEffect(() => {
    if (hasRedeemed.current) return;
    hasRedeemed.current = true;
    void accept();
  }, [accept]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        {state.status === 'working' && (
          <>
            <div className={styles.spinner} />
            <p className={styles.message}>{t('acceptingInvitation')}</p>
          </>
        )}

        {state.status === 'accepted' && (
          <>
            <h1 className={styles.title}>{t('invitationAccepted')}</h1>
            <p className={styles.message}>
              {state.role === SurveyAdminRole.editor
                ? t('youCanNowEditSurvey')
                : t('youCanNowViewSurvey')}
            </p>
            <Link className={styles.button} href={`/admin/surveys/${state.surveyId}`}>
              {state.surveyTitle || t('openSurvey')}
            </Link>
          </>
        )}

        {state.status === 'failed' && (
          <>
            <h1 className={styles.title}>{t('invitationCouldNotBeAccepted')}</h1>
            <p className={styles.errorMessage} role="alert">
              {state.message}
            </p>
            <Link className={styles.button} href="/admin/surveys">
              {t('backToSurveys')}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
