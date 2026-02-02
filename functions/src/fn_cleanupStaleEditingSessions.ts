/**
 * Firebase Function: Cleanup Stale Editing Sessions
 *
 * Scheduled function that runs every 15 minutes.
 * Removes RTDB sessions older than TTL (15 minutes) or with no active editors.
 * Prevents database bloat and ensures clean state.
 *
 * Flow:
 * 1. Query all RTDB sessions
 * 2. Check TTL timestamp
 * 3. Check for active editors
 * 4. Remove stale sessions
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import { getDatabase } from 'firebase-admin/database';

const rtdb = getDatabase();

/**
 * Session TTL in milliseconds (15 minutes)
 * Must match the TTL in liveEditingSession.ts
 */
const SESSION_TTL_MS = 15 * 60 * 1000;

/**
 * Scheduled function: Runs every 15 minutes
 * Cleans up stale RTDB editing sessions
 */
export const fn_cleanupStaleEditingSessions = onSchedule(
  {
    schedule: '*/15 * * * *', // Every 15 minutes
    timeZone: 'UTC',
    retryCount: 3,
    memory: '256MiB',
  },
  async (): Promise<void> => {
    try {
      const now = Date.now();
      const sessionsRef = rtdb.ref('liveEditing/sessions');

      // Get all sessions
      const snapshot = await sessionsRef.once('value');

      if (!snapshot.exists()) {
        logger.info('[fn_cleanupStaleEditingSessions] No sessions found');

        return;
      }

      const sessions = snapshot.val();
      const sessionIds = Object.keys(sessions);

      logger.info('[fn_cleanupStaleEditingSessions] Processing sessions', {
        count: sessionIds.length,
      });

      let removedCount = 0;

      for (const sessionId of sessionIds) {
        const session = sessions[sessionId];

        try {
          // Check if session is expired (TTL passed)
          const isExpired = session.ttl && session.ttl < now;

          // Check if session has no active editors
          const hasNoEditors =
            !session.activeEditors || Object.keys(session.activeEditors).length === 0;

          // Check if session is very old (2x TTL)
          const isVeryOld =
            session.lastUpdate && now - session.lastUpdate > SESSION_TTL_MS * 2;

          if (isExpired || hasNoEditors || isVeryOld) {
            // Remove this session
            await sessionsRef.child(sessionId).remove();
            removedCount++;

            logger.info('[fn_cleanupStaleEditingSessions] Removed session', {
              sessionId,
              reason: isExpired
                ? 'expired'
                : hasNoEditors
                  ? 'no_editors'
                  : 'very_old',
            });
          }
        } catch (error) {
          logger.error('[fn_cleanupStaleEditingSessions] Error processing session', error, {
            sessionId,
          });
          continue;
        }
      }

      logger.info('[fn_cleanupStaleEditingSessions] Cleanup complete', {
        totalSessions: sessionIds.length,
        removedSessions: removedCount,
        remainingSessions: sessionIds.length - removedCount,
      });
    } catch (error) {
      logger.error('[fn_cleanupStaleEditingSessions] Error', error);
    }
  }
);

interface CleanupSessionData {
  sessionId: string;
}

/**
 * Helper function to manually cleanup a specific session
 * Useful for admin tools or testing
 */
export const cleanupSession = onCall(
  {
    memory: '256MiB',
  },
  async (request: CallableRequest<CleanupSessionData>) => {
    const { sessionId } = request.data;

    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    if (!sessionId) {
      throw new HttpsError('invalid-argument', 'sessionId is required');
    }

    try {
      const sessionsRef = rtdb.ref('liveEditing/sessions');
      await sessionsRef.child(sessionId).remove();

      logger.info('[cleanupSession] Manually cleaned up session', {
        sessionId,
        userId: request.auth.uid,
      });

      return { success: true, sessionId };
    } catch (error) {
      logger.error('[cleanupSession] Error', error, { sessionId });
      throw new HttpsError('internal', 'Failed to cleanup session');
    }
  }
);

interface CleanupDocumentSessionsData {
  documentId: string;
}

/**
 * Helper function to cleanup all sessions for a specific document
 * Useful when a document is deleted
 */
export const cleanupDocumentSessions = onCall(
  {
    memory: '256MiB',
  },
  async (request: CallableRequest<CleanupDocumentSessionsData>) => {
    const { documentId } = request.data;

    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    if (!documentId) {
      throw new HttpsError('invalid-argument', 'documentId is required');
    }

    try {
      const sessionsRef = rtdb.ref('liveEditing/sessions');
      const snapshot = await sessionsRef.once('value');

      if (!snapshot.exists()) {
        return { success: true, removedCount: 0 };
      }

      const sessions = snapshot.val();
      const sessionIds = Object.keys(sessions);
      let removedCount = 0;

      for (const sessionId of sessionIds) {
        const session = sessions[sessionId];

        if (session.documentId === documentId) {
          await sessionsRef.child(sessionId).remove();
          removedCount++;
        }
      }

      logger.info('[cleanupDocumentSessions] Cleaned up document sessions', {
        documentId,
        removedCount,
        userId: request.auth.uid,
      });

      return { success: true, removedCount };
    } catch (error) {
      logger.error('[cleanupDocumentSessions] Error', error, { documentId });
      throw new HttpsError('internal', 'Failed to cleanup document sessions');
    }
  }
);
