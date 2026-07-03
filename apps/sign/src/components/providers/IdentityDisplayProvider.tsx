'use client';

/**
 * Provides identity-display resolution for interactions (comments, suggestions,
 * typing indicators) based on the document's identityDisplayMode setting.
 * In 'form' mode it fetches the userId → pre-form-name map and falls back to
 * pseudo-names for users who have not answered the name question.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { IdentityDisplayMode } from '@/types/demographics';
import { getPseudoName } from '@/lib/utils/pseudoName';
import { useDemographicStore } from '@/store/demographicStore';
import { logError } from '@/lib/utils/errorHandling';

export interface IdentityDisplayContextValue {
  mode: IdentityDisplayMode;
  getDisplayName: (userId: string, accountName?: string | null) => string;
  getInitial: (userId: string, accountName?: string | null) => string;
}

const IdentityDisplayContext = createContext<IdentityDisplayContextValue | null>(null);

interface IdentityDisplayProviderProps {
  documentId: string;
  mode: IdentityDisplayMode;
  children: ReactNode;
}

export function IdentityDisplayProvider({
  documentId,
  mode,
  children,
}: IdentityDisplayProviderProps) {
  const { t } = useTranslation();
  const [names, setNames] = useState<Record<string, string>>({});
  // Refetch after the user submits the survey so a fresh name shows without reload
  const answeredQuestions = useDemographicStore((state) => state.status.answeredQuestions);

  useEffect(() => {
    if (mode !== 'form') {
      return;
    }

    let cancelled = false;

    const fetchNames = async () => {
      try {
        const response = await fetch(`/api/demographics/names/${documentId}`);
        if (response.ok) {
          const data = await response.json();
          if (!cancelled) {
            setNames(data.names || {});
          }
        }
      } catch (error) {
        logError(error, {
          operation: 'IdentityDisplayProvider.fetchNames',
          documentId,
        });
      }
    };

    fetchNames();

    return () => {
      cancelled = true;
    };
  }, [documentId, mode, answeredQuestions]);

  const getDisplayName = useCallback(
    (userId: string, accountName?: string | null): string => {
      if (mode === 'account') {
        return accountName || t('Anonymous');
      }
      if (mode === 'form' && userId && names[userId]) {
        return names[userId];
      }

      return userId ? getPseudoName(userId) : t('Anonymous');
    },
    [mode, names, t]
  );

  const getInitial = useCallback(
    (userId: string, accountName?: string | null): string => {
      return getDisplayName(userId, accountName).charAt(0).toUpperCase() || '?';
    },
    [getDisplayName]
  );

  const value = useMemo(
    () => ({ mode, getDisplayName, getInitial }),
    [mode, getDisplayName, getInitial]
  );

  return (
    <IdentityDisplayContext.Provider value={value}>
      {children}
    </IdentityDisplayContext.Provider>
  );
}

/**
 * Returns the identity display helpers, or null when no provider is mounted
 * (consumers fall back to the legacy hideUserIdentity prop behavior).
 */
export function useIdentityDisplay(): IdentityDisplayContextValue | null {
  return useContext(IdentityDisplayContext);
}
