/**
 * Hook to handle public access for statements
 * Manages auto-authentication for public statements and redirects for other access levels
 */

import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useSelector } from 'react-redux';
import { Access } from '@freedi/shared-types';
import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import { handlePublicAutoAuth } from '@/controllers/auth/publicAuthHandler';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { LocalStorageObjects } from '@/types/localStorage/LocalStorageObjects';

interface UsePublicAccessResult {
  isCheckingAccess: boolean;
  effectiveAccess: Access | null;
}

export function usePublicAccess(statementId?: string): UsePublicAccessResult {
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [effectiveAccess, setEffectiveAccess] = useState<Access | null>(null);
  const creator = useSelector(creatorSelector);
  const navigate = useNavigate();
  const location = useLocation();

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

        // Handle based on access level
        if (access === Access.public) {
          // Public access - auto-authenticate silently
          console.info('Public statement detected, initiating auto-authentication');
          await handlePublicAutoAuth();
        } else if (access && !creator?.uid) {
          // Non-public access without auth - save location and redirect to login
          console.info(`${access} statement requires authentication, redirecting to login`);
          
          // Save the current location so user can return after login
          const historyData = {
            pathname: location.pathname,
            search: location.search,
            hash: location.hash
          };
          localStorage.setItem(
            LocalStorageObjects.InitialRoute,
            JSON.stringify(historyData)
          );
          
          navigate('/start', { replace: true });
        }
      } catch (error) {
        console.error('Error checking public access:', error);
      } finally {
        setIsCheckingAccess(false);
      }
    };

    checkPublicAccess();
  }, [statementId, creator?.uid, navigate, location]);

  return {
    isCheckingAccess,
    effectiveAccess
  };
}