/**
 * Server-side Research Logger for Mass Consensus
 *
 * Logs user actions to Firestore researchLogs collection.
 * Only stores uid — no displayName or other PII.
 * Called from API routes using Firebase Admin SDK.
 */

import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { Collections, ResearchAction, getResearchLogId } from '@freedi/shared-types';
import type { ResearchLog } from '@freedi/shared-types';
import { logger } from './logger';

/**
 * Log a research action to Firestore (server-side, non-blocking).
 */
export function logResearchAction(
  userId: string,
  action: ResearchAction,
  data?: Partial<
    Pick<
      ResearchLog,
      | 'topParentId'
      | 'parentId'
      | 'statementId'
      | 'screen'
      | 'previousValue'
      | 'newValue'
      | 'metadata'
    >
  >,
): void {
  try {
    const db = getFirestoreAdmin();
    const timestamp = Date.now();
    const logId = getResearchLogId(userId, timestamp);

    const logEntry: ResearchLog = {
      logId,
      userId,
      action,
      timestamp,
      sourceApp: 'mass-consensus',
      ...data,
    };

    db.collection(Collections.researchLogs).doc(logId).set(logEntry).catch((error) => {
      logger.error('[ResearchLogger] Failed to write log:', error);
    });
  } catch (error) {
    logger.error('[ResearchLogger] Error creating log entry:', error);
  }
}
