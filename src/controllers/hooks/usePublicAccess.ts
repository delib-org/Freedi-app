/**
 * Hook to handle access for statements
 * Manages auto-authentication for unauthenticated users (anonymous auth)
 * Users can login explicitly via profile icon if they want a permanent account
 */

import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Access } from '@freedi/shared-types';
import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import { handlePublicAutoAuth } from '@/controllers/auth/publicAuthHandler';
import { creatorSelector } from '@/redux/creator/creatorSlice';

interface UsePublicAccessResult {
  isCheckingAccess: boolean;
  effectiveAccess: Access | null;
}

export function usePublicAccess(statementId?: string): UsePublicAccessResult {
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [effectiveAccess, setEffectiveAccess] = useState<Access | null>(null);
  const creator = useSelector(creatorSelector);

  useEffect(() => {
    const checkPublicAccess = async () => {
      // If no statementId, nothing to check
      if (!statementId) {
        setIsCheckingAccess(false);
        
        return;
      }

      // If user is already authenticated, no need to check
      if (creator?.uid) {
        setIsCheckingAccess(false);
        
        return;
      }

      try {
        // Get the statement
        const statement = await getStatementFromDB(statementId);
        
        if (!statement) {
          setIsCheckingAccess(false);
          
          return;
        }

        // Get the top parent statement if needed
        let topParentStatement = null;
        if (statement.topParentId && statement.topParentId !== statementId) {
          topParentStatement = await getStatementFromDB(statement.topParentId);
        }

        // Determine effective access - statement override or topParent
        const access = statement?.membership?.access || topParentStatement?.membership?.access;
        setEffectiveAccess(access || null);

        // Auto-authenticate for all access levels - don't redirect to login
        // Users can login explicitly via profile icon if needed
        if (!creator?.uid) {
          console.info('User not authenticated, initiating auto-authentication');
          await handlePublicAutoAuth();
        }
      } catch (error) {
        console.error('Error checking public access:', error);
      } finally {
        setIsCheckingAccess(false);
      }
    };

    checkPublicAccess();
  }, [statementId, creator?.uid]);

  return {
    isCheckingAccess,
    effectiveAccess
  };
}