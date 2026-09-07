'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  SurveyAccess,
  SurveyAdmin,
  SurveyAdminInvitationStatus,
  SurveyAdminRole,
  buildSurveyAccess,
} from '@freedi/shared-types';
import { authedFetch, NotAuthenticatedError } from '@/lib/api/authedFetch';
import { logError } from '@/lib/utils/errorHandling';

/** A pending invitation as the roster endpoint returns it (no token hash). */
export interface PendingInvitation {
  invitationId: string;
  invitedEmail: string;
  role: SurveyAdminRole;
  status: SurveyAdminInvitationStatus;
  createdAt: number;
  expiresAt: number;
}

interface RosterResponse {
  ownerId: string;
  access: SurveyAccess;
  admins: SurveyAdmin[];
  invitations: PendingInvitation[];
}

export interface UseSurveyAdminsResult {
  access: SurveyAccess | null;
  ownerId: string | null;
  admins: SurveyAdmin[];
  invitations: PendingInvitation[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Load a survey's admin roster and the caller's own access level.
 *
 * Access is deliberately `null` until the request resolves so callers render
 * read-only affordances rather than briefly offering controls the user may not
 * be allowed to use.
 */
export function useSurveyAdmins(surveyId: string): UseSurveyAdminsResult {
  const [access, setAccess] = useState<SurveyAccess | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [admins, setAdmins] = useState<SurveyAdmin[]>([]);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authedFetch(`/api/surveys/${surveyId}/admins`);

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Failed to load survey admins');
      }

      const data = (await response.json()) as RosterResponse;

      setOwnerId(data.ownerId);
      setAccess(data.access ?? buildSurveyAccess('viewer'));
      setAdmins(data.admins ?? []);
      setInvitations(data.invitations ?? []);
    } catch (err) {
      if (!(err instanceof NotAuthenticatedError)) {
        logError(err, {
          operation: 'useSurveyAdmins.refresh',
          metadata: { surveyId },
        });
      }

      setError(err instanceof Error ? err.message : 'Failed to load survey admins');
    } finally {
      setIsLoading(false);
    }
  }, [surveyId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { access, ownerId, admins, invitations, isLoading, error, refresh };
}
